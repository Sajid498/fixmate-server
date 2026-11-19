
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

const getDocumentId = (
  value: string | string[] | undefined,
): string | null => {
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return value;
};

const approvalSchema = z.object({
  approvalStatus: z.enum(["approved", "rejected"]),
});

const roleSchema = z.object({
  role: z.enum(["customer", "technician", "admin"]),
});

router.get(
  "/users",
  authenticate,
  authorize("admin"),
  async (_req, res) => {
    try {
      const database = getDatabase();

      const users = await database
        .collection("users")
        .find(
          {},
          {
            projection: {
              name: 1,
              email: 1,
              role: 1,
              image: 1,
              phone: 1,
              area: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: users.length,
        data: users,
      });
    } catch (error) {
      console.error("Get admin users error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve users.",
      });
    }
  },
);

router.patch(
  "/users/:id/role",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const userId = getDocumentId(req.params.id);

      if (!userId) {
        res.status(400).json({
          success: false,
          message: "Invalid user ID.",
        });
        return;
      }

      const validation = roleSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: "A valid user role is required.",
        });
        return;
      }

      const currentUser = getUser(res);

      if (currentUser.id === userId) {
        res.status(403).json({
          success: false,
          message: "You cannot change your own role.",
        });
        return;
      }

      const database = getDatabase();

      const result = await database.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            role: validation.data.role,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        res.status(404).json({
          success: false,
          message: "User not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "User role updated successfully.",
        role: validation.data.role,
      });
    } catch (error) {
      console.error("Update user role error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to update user role.",
      });
    }
  },
);

router.get(
  "/services",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const database = getDatabase();
      const filter: Record<string, unknown> = {};

      const approvalStatus = req.query.approvalStatus;
      const category = req.query.category;

      if (
        typeof approvalStatus === "string" &&
        ["pending", "approved", "rejected"].includes(approvalStatus)
      ) {
        filter.approvalStatus = approvalStatus;
      }

      if (typeof category === "string" && category.trim()) {
        filter.category = category.trim();
      }

      const services = await database
        .collection("services")
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: services.length,
        data: services,
      });
    } catch (error) {
      console.error("Get admin services error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve services.",
      });
    }
  },
);

router.get(
  "/services/pending",
  authenticate,
  authorize("admin"),
  async (_req, res) => {
    try {
      const database = getDatabase();

      const services = await database
        .collection("services")
        .find({ approvalStatus: "pending" })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: services.length,
        data: services,
      });
    } catch (error) {
      console.error("Get pending services error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve pending services.",
      });
    }
  },
);

router.patch(
  "/services/:id/approval",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const serviceId = getDocumentId(req.params.id);

      if (!serviceId) {
        res.status(400).json({
          success: false,
          message: "Invalid service ID.",
        });
        return;
      }

      const validation = approvalSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: "Approval status must be approved or rejected.",
        });
        return;
      }

      const database = getDatabase();

      const result = await database.collection("services").updateOne(
        {
          _id: new ObjectId(serviceId),
          approvalStatus: "pending",
        },
        {
          $set: {
            approvalStatus: validation.data.approvalStatus,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        res.status(404).json({
          success: false,
          message: "Pending service not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message:
          validation.data.approvalStatus === "approved"
            ? "Service approved successfully."
            : "Service rejected successfully.",
        approvalStatus: validation.data.approvalStatus,
      });
    } catch (error) {
      console.error("Update service approval error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to update service approval.",
      });
    }
  },
);

router.get(
  "/bookings",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const database = getDatabase();
      const filter: Record<string, unknown> = {};

      const status = req.query.status;

      if (
        typeof status === "string" &&
        [
          "requested",
          "accepted",
          "rejected",
          "in-progress",
          "completed",
          "cancelled",
        ].includes(status)
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
      console.error("Get admin bookings error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve bookings.",
      });
    }
  },
);

router.get(
  "/payments",
  authenticate,
  authorize("admin"),
  async (_req, res) => {
    try {
      const database = getDatabase();
      const paymentsCollection = database.collection("payments");

      const [payments, summary] = await Promise.all([
        paymentsCollection
          .find({})
          .sort({ paidAt: -1 })
          .toArray(),
        paymentsCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalTransactions: { $sum: 1 },
              },
            },
          ])
          .toArray(),
      ]);

      const totals = summary[0] || {
        totalRevenue: 0,
        totalTransactions: 0,
      };

      res.status(200).json({
        success: true,
        count: payments.length,
        totalRevenue: totals.totalRevenue,
        totalTransactions: totals.totalTransactions,
        data: payments,
      });
    } catch (error) {
      console.error("Get admin payments error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve payment transactions.",
      });
    }
  },
);

export default router;
