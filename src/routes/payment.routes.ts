
import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { ObjectId, type ClientSession } from "mongodb";
import Stripe from "stripe";
import { getDatabase, getMongoClient } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
const paymentMode = process.env.PAYMENT_MODE || "stripe";
const simulatorEnabled = process.env.PAYMENT_DEV_SIMULATOR === "true";
const paymentCurrency = (process.env.PAYMENT_CURRENCY || "usd").toLowerCase();
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: "customer" | "technician" | "admin";
}

interface BookingDocument {
  _id: ObjectId;
  customerEmail: string;
  customerName?: string;
  technicianName?: string;
  technicianEmail?: string;
  serviceTitle: string;
  status: string;
  paymentStatus: string;
  finalAmount: number;
}

interface PaymentDocument {
  _id?: ObjectId;
  bookingId: string;
  serviceTitle: string;
  customerName: string;
  customerEmail: string;
  technicianName: string;
  technicianEmail: string;
  amount: number;
  currency: string;
  transactionId: string;
  stripeSessionId?: string;
  paymentProvider: "stripe" | "development_simulator";
  paymentStatus: "paid";
  paidAt: Date;
}

function getUser(res: { locals: Record<string, unknown> }): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

function getAmountInMinorUnits(amount: unknown): number | null {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }

  const minorUnits = Math.round(numericAmount * 100);

  return Number.isSafeInteger(minorUnits) && minorUnits > 0
    ? minorUnits
    : null;
}

function simulatorIsAvailable(): boolean {
  return process.env.NODE_ENV !== "production" && simulatorEnabled;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

export async function ensurePaymentIndexes(): Promise<void> {
  const payments = getDatabase().collection("payments");

  await payments.createIndex(
    { bookingId: 1 },
    { unique: true, name: "unique_payment_per_booking" },
  );

  await payments.createIndex(
    { stripeSessionId: 1 },
    {
      unique: true,
      sparse: true,
      name: "unique_stripe_session",
    },
  );

  await payments.createIndex(
    { customerEmail: 1, paidAt: -1 },
    { name: "customer_payment_history" },
  );
}

async function findOwnedCompletedBooking(
  bookingId: string,
  customerEmail: string,
): Promise<BookingDocument | null> {
  if (!ObjectId.isValid(bookingId)) {
    return null;
  }

  return getDatabase().collection<BookingDocument>("bookings").findOne({
    _id: new ObjectId(bookingId),
    customerEmail,
    status: "completed",
  });
}

async function recordPaymentAtomically(
  bookingId: string,
  customerEmail: string,
  payment: PaymentDocument,
): Promise<PaymentDocument> {
  const database = getDatabase();
  const session = getMongoClient().startSession();

  let savedPayment: PaymentDocument | null = null;

  try {
    await session.withTransaction(async () => {
      const bookings = database.collection<BookingDocument>("bookings");
      const payments = database.collection<PaymentDocument>("payments");

      const existingPayment = await payments.findOne(
        { bookingId },
        { session },
      );

      if (existingPayment) {
        if (existingPayment.paymentProvider !== payment.paymentProvider) {
          throw new Error("PAYMENT_PROVIDER_CONFLICT");
        }

        const bookingUpdate = await bookings.updateOne(
          {
            _id: new ObjectId(bookingId),
            customerEmail,
            status: "completed",
          },
          {
            $set: {
              paymentStatus: "paid",
              updatedAt: new Date(),
            },
          },
          { session },
        );

        if (bookingUpdate.matchedCount === 0) {
          throw new Error("BOOKING_NOT_PAYABLE");
        }

        savedPayment = existingPayment;
        return;
      }

      const bookingUpdate = await bookings.updateOne(
        {
          _id: new ObjectId(bookingId),
          customerEmail,
          status: "completed",
          paymentStatus: "unpaid",
        },
        {
          $set: {
            paymentStatus: "paid",
            updatedAt: new Date(),
          },
        },
        { session },
      );

      if (bookingUpdate.matchedCount === 0) {
        throw new Error("BOOKING_NOT_PAYABLE");
      }

      const insertResult = await payments.insertOne(payment, { session });

      savedPayment = {
        ...payment,
        _id: insertResult.insertedId,
      };
    });

    if (!savedPayment) {
      throw new Error("PAYMENT_RECORD_NOT_CREATED");
    }

    return savedPayment;
  } finally {
    await session.endSession();
  }
}

function sendPaymentError(
  res: Parameters<Parameters<typeof router.post>[1]>[1],
  error: unknown,
  fallbackMessage: string,
): void {
  if (error instanceof Error && error.message === "PAYMENT_PROVIDER_CONFLICT") {
    res.status(409).json({
      success: false,
      message: "This booking has already been paid through another payment mode.",
    });
    return;
  }

  if (error instanceof Error && error.message === "BOOKING_NOT_PAYABLE") {
    res.status(409).json({
      success: false,
      message: "This booking is no longer eligible for payment.",
    });
    return;
  }

  if (isDuplicateKeyError(error)) {
    res.status(409).json({
      success: false,
      message: "A payment has already been recorded for this booking.",
    });
    return;
  }

  console.error(fallbackMessage, error);

  res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}

router.post(
  "/create-checkout-session",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const bookingId = req.body?.bookingId;

      if (typeof bookingId !== "string" || !ObjectId.isValid(bookingId)) {
        res.status(400).json({
          success: false,
          message: "A valid booking ID is required.",
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();

      const booking = await database
        .collection<BookingDocument>("bookings")
        .findOne({
          _id: new ObjectId(bookingId),
          customerEmail: user.email,
          status: "completed",
          paymentStatus: "unpaid",
        });

      if (!booking) {
        res.status(404).json({
          success: false,
          message: "Completed unpaid booking not found.",
        });
        return;
      }

      const existingPayment = await database
        .collection("payments")
        .findOne({ bookingId });

      if (existingPayment) {
        res.status(409).json({
          success: false,
          message: "This booking already has a recorded payment.",
        });
        return;
      }

      const amountInMinorUnits = getAmountInMinorUnits(booking.finalAmount);

      if (amountInMinorUnits === null) {
        res.status(400).json({
          success: false,
          message: "The booking has an invalid payment amount.",
        });
        return;
      }

      if (paymentMode === "development") {
        if (!simulatorIsAvailable()) {
          res.status(403).json({
            success: false,
            message: "The development payment simulator is disabled.",
          });
          return;
        }

        res.status(200).json({
          success: true,
          mode: "development",
          message: "Development payment simulator is ready.",
          checkoutUrl: `${clientUrl}/payment/development?bookingId=${encodeURIComponent(bookingId)}`,
        });
        return;
      }

      if (paymentMode !== "stripe" || !stripe) {
        res.status(503).json({
          success: false,
          message: "Stripe test mode is not configured. Set valid Stripe test API keys.",
        });
        return;
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: paymentCurrency,
              unit_amount: amountInMinorUnits,
              product_data: {
                name: booking.serviceTitle,
                description: `FixMate repair service for booking ${bookingId}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingId,
          customerEmail: user.email,
        },
        client_reference_id: bookingId,
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel`,
      });

      if (!checkoutSession.url) {
        res.status(502).json({
          success: false,
          message: "Stripe did not return a Checkout URL.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        mode: "stripe",
        message: "Stripe Checkout Session created.",
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
      });
    } catch (error) {
      console.error("Create payment checkout error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to start checkout.",
      });
    }
  },
);

router.get(
  "/verify",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      if (!stripe || paymentMode !== "stripe") {
        res.status(503).json({
          success: false,
          message: "Stripe verification is not available in the current payment mode.",
        });
        return;
      }

      const sessionId = req.query.session_id;

      if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
        res.status(400).json({
          success: false,
          message: "A valid Stripe session ID is required.",
        });
        return;
      }

      const user = getUser(res);
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (
        session.mode !== "payment" ||
        session.status !== "complete" ||
        session.payment_status !== "paid" ||
        session.metadata?.customerEmail !== user.email ||
        session.client_reference_id !== session.metadata?.bookingId ||
        !session.metadata?.bookingId
      ) {
        res.status(400).json({
          success: false,
          message: "Payment is incomplete or the Checkout session is invalid.",
        });
        return;
      }

      const bookingId = session.metadata.bookingId;

      if (!ObjectId.isValid(bookingId)) {
        res.status(400).json({
          success: false,
          message: "Invalid booking information in payment session.",
        });
        return;
      }

      const booking = await findOwnedCompletedBooking(bookingId, user.email);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: "Completed booking not found.",
        });
        return;
      }

      const expectedAmount = getAmountInMinorUnits(booking.finalAmount);

      if (
        expectedAmount === null ||
        session.amount_total !== expectedAmount ||
        session.currency !== paymentCurrency
      ) {
        res.status(400).json({
          success: false,
          message: "Payment amount or currency does not match the booking.",
        });
        return;
      }

      const transactionId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || session.id;

      const payment: PaymentDocument = {
        bookingId,
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName || user.name,
        customerEmail: user.email,
        technicianName: booking.technicianName || "",
        technicianEmail: booking.technicianEmail || "",
        amount: Number(booking.finalAmount),
        currency: paymentCurrency,
        transactionId,
        stripeSessionId: session.id,
        paymentProvider: "stripe",
        paymentStatus: "paid",
        paidAt: new Date(),
      };

      const savedPayment = await recordPaymentAtomically(
        bookingId,
        user.email,
        payment,
      );

      res.status(200).json({
        success: true,
        message: "Payment verified successfully.",
        data: savedPayment,
      });
    } catch (error) {
      sendPaymentError(res, error, "Unable to verify payment.");
    }
  },
);

router.post(
  "/development/confirm",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      if (!simulatorIsAvailable() || paymentMode !== "development") {
        res.status(404).json({
          success: false,
          message: "Development payment simulator is unavailable.",
        });
        return;
      }

      const bookingId = req.body?.bookingId;

      if (typeof bookingId !== "string" || !ObjectId.isValid(bookingId)) {
        res.status(400).json({
          success: false,
          message: "A valid booking ID is required.",
        });
        return;
      }

      const user = getUser(res);
      const booking = await findOwnedCompletedBooking(bookingId, user.email);

      if (!booking) {
        const existing = await getDatabase()
          .collection("payments")
          .findOne({
            bookingId,
            customerEmail: user.email,
          });

        if (existing?.paymentProvider === "development_simulator") {
          res.status(200).json({
            success: true,
            message: "Development payment was already recorded.",
            data: existing,
          });
          return;
        }

        res.status(404).json({
          success: false,
          message: "Completed booking not found.",
        });
        return;
      }

      const amountInMinorUnits = getAmountInMinorUnits(booking.finalAmount);

      if (amountInMinorUnits === null) {
        res.status(400).json({
          success: false,
          message: "The booking has an invalid payment amount.",
        });
        return;
      }

      const payment: PaymentDocument = {
        bookingId,
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName || user.name,
        customerEmail: user.email,
        technicianName: booking.technicianName || "",
        technicianEmail: booking.technicianEmail || "",
        amount: Number(booking.finalAmount),
        currency: paymentCurrency,
        transactionId: `DEV-${randomUUID()}`,
        paymentProvider: "development_simulator",
        paymentStatus: "paid",
        paidAt: new Date(),
      };

      const savedPayment = await recordPaymentAtomically(
        bookingId,
        user.email,
        payment,
      );

      res.status(200).json({
        success: true,
        message: "Development payment simulated successfully. No real money was charged.",
        data: savedPayment,
      });
    } catch (error) {
      sendPaymentError(
        res,
        error,
        "Unable to complete development payment simulation.",
      );
    }
  },
);

router.get(
  "/mine",
  authenticate,
  authorize("customer"),
  async (_req, res) => {
    try {
      const user = getUser(res);

      const payments = await getDatabase()
        .collection("payments")
        .find({ customerEmail: user.email })
        .sort({ paidAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: payments.length,
        data: payments,
      });
    } catch (error) {
      console.error("Get customer payments error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve payment history.",
      });
    }
  },
);

export default router;
