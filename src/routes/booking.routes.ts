
import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

const bookingSchema = z.object({
  serviceId: z.string().refine((value) => ObjectId.isValid(value), {
    message: "A valid service ID is required.",
  }),
  customerPhone: z.string().trim().min(7).max(20),
  address: z.string().trim().min(5).max(250),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Preferred date must use YYYY-MM-DD format.",
  }),
  problemDescription: z.string().trim().min(20).max(2000),
});

const getUser = (res: {
  locals: Record<string, unknown>;
}) =>
  res.locals.user as {
    id: string;
    name: string;
    email: string;
    role: "customer" | "technician" | "admin";
  };

const getBookingId = (
  value: string | string[] | undefined,
): string | null => {
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return value;
};

const getDhakaDate = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

router.post(
  "/",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const validation = bookingSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: validation.error.issues[0]?.message,
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();
      const {
        serviceId,
        customerPhone,
        address,
        preferredDate,
        problemDescription,
      } = validation.data;

      if (preferredDate < getDhakaDate()) {
        res.status(400).json({
          success: false,
          message: "Preferred date cannot be in the past.",
        });
        return;
      }

      const parsedDate = new Date(`${preferredDate}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== preferredDate
      ) {
        res.status(400).json({
          success: false,
          message: "Please provide a valid preferred date.",
        });
        return;
      }

      const service = await database.collection("services").findOne({
        _id: new ObjectId(serviceId),
        approvalStatus: "approved",
        isAvailable: true,
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "This service is not available for booking.",
        });
        return;
      }

      if (service.technicianEmail === user.email) {
        res.status(403).json({
          success: false,
          message: "You cannot request your own service.",
        });
        return;
      }

      const existingBooking = await database.collection("bookings").findOne({
        serviceId,
        customerEmail: user.email,
        status: {
          $in: ["requested", "accepted", "in-progress"],
        },
      });

      if (existingBooking) {
        res.status(409).json({
          success: false,
          message: "You already have an active request for this service.",
        });
        return;
      }

      const booking = {
        serviceId,
        serviceTitle: service.title,
        serviceImage: service.image,
        category: service.category,
        basePrice: service.basePrice,
        technicianName: service.technicianName,
        technicianEmail: service.technicianEmail,
        customerName: user.name,
        customerEmail: user.email,
        customerPhone,
        address,
        preferredDate: parsedDate,
        problemDescription,
        status: "requested",
        finalAmount: service.basePrice,
        paymentStatus: "unpaid",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await database
        .collection("bookings")
        .insertOne(booking);

      res.status(201).json({
        success: true,
        message: "Repair request submitted successfully.",
        data: {
          _id: result.insertedId,
          ...booking,
        },
      });
    } catch (error) {
      console.error("Create booking error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to submit your repair request.",
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

      const bookings = await database
        .collection("bookings")
        .find({ customerEmail: user.email })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error("Get customer bookings error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve your bookings.",
      });
    }
  },
);

router.patch(
  "/:id/cancel",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const bookingId = getBookingId(req.params.id);

      if (!bookingId) {
        res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();

      const result = await database.collection("bookings").updateOne(
        {
          _id: new ObjectId(bookingId),
          customerEmail: user.email,
          status: "requested",
        },
        {
          $set: {
            status: "cancelled",
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        res.status(404).json({
          success: false,
          message: "Booking not found or it can no longer be cancelled.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Repair request cancelled successfully.",
      });
    } catch (error) {
      console.error("Cancel booking error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to cancel your repair request.",
      });
    }
  },
);

export default router;
