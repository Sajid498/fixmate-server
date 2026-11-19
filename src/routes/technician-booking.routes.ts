
import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

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

const statusSchema = z.object({
  status: z.enum(["accepted", "rejected", "in-progress", "completed"]),
  finalAmount: z.number().positive().finite().optional(),
}).strict();

router.get(
  "/",
  authenticate,
  authorize("technician"),
  async (req, res) => {
    try {
      const user = getUser(res);
      const database = getDatabase();

      const status = req.query.status;
      const filter: Record<string, unknown> = {
        technicianEmail: user.email,
      };

      if (
        typeof status === "string" &&
        ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"].includes(status)
      ) {
        filter.status = status;
      }

      const bookings = await database
        .collection("bookings")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: bookings.length,
        data: bookings,
      });
    } catch (error) {
      console.error("Get technician bookings error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve technician bookings.",
      });
    }
  },
);

router.patch(
  "/:id/status",
  authenticate,
  authorize("technician"),
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

      const validation = statusSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: validation.error.issues[0]?.message,
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();
      const bookings = database.collection("bookings");
      const booking = await bookings.findOne({
        _id: new ObjectId(bookingId),
        technicianEmail: user.email,
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          message: "Booking not found or you do not own this booking.",
        });
        return;
      }

      const { status, finalAmount } = validation.data;

      const allowedTransitions: Record<string, string[]> = {
        requested: ["accepted", "rejected"],
        accepted: ["in-progress"],
        "in-progress": ["completed"],
      };

      if (!allowedTransitions[booking.status]?.includes(status)) {
        res.status(400).json({
          success: false,
          message: `Cannot change booking status from ${booking.status} to ${status}.`,
        });
        return;
      }

      if (status === "completed" && finalAmount === undefined) {
        res.status(400).json({
          success: false,
          message: "Final amount is required to complete a booking.",
        });
        return;
      }

      const updateFields: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };

      if (status === "completed") {
        updateFields.finalAmount = finalAmount;
      }

      const result = await bookings.updateOne(
        {
          _id: new ObjectId(bookingId),
          technicianEmail: user.email,
          status: booking.status,
        },
        {
          $set: updateFields,
        },
      );

      if (result.matchedCount === 0) {
        res.status(409).json({
          success: false,
          message: "Booking changed before your update. Please refresh and try again.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Booking status updated to ${status}.`,
        status,
        ...(status === "completed" ? { finalAmount } : {}),
      });
    } catch (error) {
      console.error("Update technician booking error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to update booking status.",
      });
    }
  },
);

export default router;
