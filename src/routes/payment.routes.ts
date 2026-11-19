
import { Router } from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const getUser = (res: {
  locals: Record<string, unknown>;
}) =>
  res.locals.user as {
    id: string;
    name: string;
    email: string;
    role: "customer" | "technician" | "admin";
  };

router.post(
  "/create-checkout-session",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      if (!stripe) {
        res.status(500).json({
          success: false,
          message: "Stripe is not configured.",
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
      const database = getDatabase();

      const booking = await database.collection("bookings").findOne({
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

      const existingPayment = await database.collection("payments").findOne({
        bookingId,
      });

      if (existingPayment) {
        res.status(409).json({
          success: false,
          message: "This booking has already been paid.",
        });
        return;
      }

      const amountInCents = Math.round(Number(booking.finalAmount) * 100);

      if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
        res.status(400).json({
          success: false,
          message: "The booking has an invalid payment amount.",
        });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountInCents,
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
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel`,
      });

      res.status(200).json({
        success: true,
        message: "Stripe Checkout Session created.",
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Create Stripe Checkout Session error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to create Stripe Checkout Session.",
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
      if (!stripe) {
        res.status(500).json({
          success: false,
          message: "Stripe is not configured.",
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
      const database = getDatabase();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (
        session.payment_status !== "paid" ||
        session.metadata?.customerEmail !== user.email ||
        !session.metadata?.bookingId
      ) {
        res.status(400).json({
          success: false,
          message: "Payment has not been completed or the session is invalid.",
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

      const booking = await database.collection("bookings").findOne({
        _id: new ObjectId(bookingId),
        customerEmail: user.email,
        status: "completed",
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          message: "Completed booking not found.",
        });
        return;
      }

      const expectedAmount = Math.round(Number(booking.finalAmount) * 100);

      if (
        session.amount_total !== expectedAmount ||
        session.currency !== "usd"
      ) {
        res.status(400).json({
          success: false,
          message: "Payment amount does not match the booking.",
        });
        return;
      }

      const payments = database.collection("payments");

      await payments.createIndex({ bookingId: 1 }, { unique: true });
      await payments.createIndex({ stripeSessionId: 1 }, { unique: true });

      const existingPayment = await payments.findOne({ bookingId });

      if (existingPayment) {
        await database.collection("bookings").updateOne(
          {
            _id: new ObjectId(bookingId),
            customerEmail: user.email,
            status: "completed",
          },
          {
            $set: {
              paymentStatus: "paid",
              updatedAt: new Date(),
            },
          },
        );

        res.status(200).json({
          success: true,
          message: "Payment was already verified.",
          data: existingPayment,
        });
        return;
      }

      const transactionId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";

      const payment = {
        bookingId,
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        technicianName: booking.technicianName,
        technicianEmail: booking.technicianEmail,
        amount: Number(booking.finalAmount),
        currency: "usd",
        transactionId,
        stripeSessionId: session.id,
        paymentStatus: "paid",
        paidAt: new Date(),
      };

      try {
        await payments.insertOne(payment);
      } catch (error) {
        const duplicatePayment = await payments.findOne({ bookingId });

        if (!duplicatePayment) {
          throw error;
        }
      }

      const savedPayment = await payments.findOne({ bookingId });

      await database.collection("bookings").updateOne(
        {
          _id: new ObjectId(bookingId),
          customerEmail: user.email,
          status: "completed",
          paymentStatus: "unpaid",
        },
        {
          $set: {
            paymentStatus: "paid",
            updatedAt: new Date(),
          },
        },
      );

      res.status(200).json({
        success: true,
        message: "Payment verified successfully.",
        data: savedPayment,
      });
    } catch (error) {
      console.error("Verify Stripe payment error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to verify payment.",
      });
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
      const database = getDatabase();

      const payments = await database
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
