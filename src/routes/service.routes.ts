
import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

const serviceCategories = [
  "Smartphone",
  "Laptop & PC",
  "AC",
  "Refrigerator",
  "TV",
  "Washing Machine",
  "Electrical",
] as const;

const serviceSchema = z.object({
  title: z.string().trim().min(3).max(100),
  category: z.enum(serviceCategories),
  description: z.string().trim().min(20).max(2000),
  image: z.string().url().max(2048),
  basePrice: z.number().positive().finite(),
  estimatedDuration: z.string().trim().min(2).max(50),
  serviceMode: z.enum(["Home Visit", "Shop Drop-off"]),
  serviceArea: z.string().trim().min(2).max(120),
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

const getServiceId = (
  value: string | string[] | undefined,
): string | null => {
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return value;
};

// Create a service (Technician only)
router.post(
  "/",
  authenticate,
  authorize("technician"),
  async (req, res) => {
    try {
      const validation = serviceSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: validation.error.issues[0]?.message,
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();

      const service = {
        ...validation.data,
        technicianName: user.name,
        technicianEmail: user.email,
        approvalStatus: "pending",
        isAvailable: true,
        createdAt: new Date(),
      };

      const result = await database
        .collection("services")
        .insertOne(service);

      res.status(201).json({
        success: true,
        message: "Service created and submitted for admin approval.",
        data: {
          _id: result.insertedId,
          ...service,
        },
      });
    } catch (error) {
      console.error("Create service error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to create service.",
      });
    }
  },
);

// Get services belonging to the logged-in technician
router.get(
  "/mine",
  authenticate,
  authorize("technician"),
  async (_req, res) => {
    try {
      const user = getUser(res);
      const database = getDatabase();

      const services = await database
        .collection("services")
        .find({ technicianEmail: user.email })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        count: services.length,
        data: services,
      });
    } catch (error) {
      console.error("Get technician services error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve your services.",
      });
    }
  },
);

// Get public services with server-side search, filters, sorting and pagination
router.get("/", async (req, res) => {
  try {
    const querySchema = z.object({
      search: z.string().trim().max(100).optional(),
      category: z.enum(serviceCategories).optional(),
      serviceMode: z.enum(["Home Visit", "Shop Drop-off"]).optional(),
      serviceArea: z.string().trim().max(120).optional(),
      sort: z
        .enum(["newest", "price-low", "price-high"])
        .default("newest"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(12),
    });

    const validation = querySchema.safeParse(req.query);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message:
          validation.error.issues[0]?.message ||
          "Invalid search parameters.",
      });
      return;
    }

    const {
      search,
      category,
      serviceMode,
      serviceArea,
      sort,
      page,
      limit,
    } = validation.data;

    const database = getDatabase();

    // Escape special regex characters in user input.
    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Only approved and available services are publicly visible.
    const filter: Record<string, unknown> = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    // Search by service title or category.
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");

      filter.$or = [
        { title: searchRegex },
        { category: searchRegex },
      ];
    }

    // Filter by category.
    if (category) {
      filter.category = category;
    }

    // Filter by service mode.
    if (serviceMode) {
      filter.serviceMode = serviceMode;
    }

    // Filter by service area.
    if (serviceArea) {
      filter.serviceArea = new RegExp(escapeRegex(serviceArea), "i");
    }

    // Server-side sorting.
    const sortOptions = {
      newest: { createdAt: -1 as const },
      "price-low": { basePrice: 1 as const },
      "price-high": { basePrice: -1 as const },
    };

    const skip = (page - 1) * limit;

    // Fetch matching services and count matching documents.
    const [services, total] = await Promise.all([
      database
        .collection("services")
        .find(filter)
        .sort(sortOptions[sort])
        .skip(skip)
        .limit(limit)
        .toArray(),

      database.collection("services").countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      count: total,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && total > 0,
      },
      data: services,
    });
  } catch (error) {
    console.error("Get public services error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve services.",
    });
  }
});

// Get a single approved service by ID
router.get("/:id", async (req, res) => {
  try {
    const serviceId = getServiceId(req.params.id);

    if (!serviceId) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
      return;
    }

    const database = getDatabase();

    const service = await database.collection("services").findOne({
      _id: new ObjectId(serviceId),
      approvalStatus: "approved",
      isAvailable: true,
    });

    if (!service) {
      res.status(404).json({
        success: false,
        message: "Service not found or currently unavailable.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error) {
    console.error("Get service details error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve service details.",
    });
  }
});

// Update a technician's own service
router.put(
  "/:id",
  authenticate,
  authorize("technician"),
  async (req, res) => {
    try {
      const serviceId = getServiceId(req.params.id);

      if (!serviceId) {
        res.status(400).json({
          success: false,
          message: "Invalid service ID.",
        });
        return;
      }

      const validation = serviceSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: validation.error.issues[0]?.message,
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();

      const result = await database.collection("services").updateOne(
        {
          _id: new ObjectId(serviceId),
          technicianEmail: user.email,
        },
        {
          $set: {
            ...validation.data,
            approvalStatus: "pending",
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        res.status(404).json({
          success: false,
          message: "Service not found or you do not own this service.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Service updated and resubmitted for admin approval.",
      });
    } catch (error) {
      console.error("Update service error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to update service.",
      });
    }
  },
);

// Delete a technician's own service
router.delete(
  "/:id",
  authenticate,
  authorize("technician"),
  async (req, res) => {
    try {
      const serviceId = getServiceId(req.params.id);

      if (!serviceId) {
        res.status(400).json({
          success: false,
          message: "Invalid service ID.",
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();

      const result = await database.collection("services").deleteOne({
        _id: new ObjectId(serviceId),
        technicianEmail: user.email,
      });

      if (result.deletedCount === 0) {
        res.status(404).json({
          success: false,
          message: "Service not found or you do not own this service.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Service deleted successfully.",
      });
    } catch (error) {
      console.error("Delete service error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to delete service.",
      });
    }
  },
);

// Toggle service availability
router.patch(
  "/:id/availability",
  authenticate,
  authorize("technician"),
  async (req, res) => {
    try {
      const serviceId = getServiceId(req.params.id);

      if (!serviceId) {
        res.status(400).json({
          success: false,
          message: "Invalid service ID.",
        });
        return;
      }

      const validation = z
        .object({
          isAvailable: z.boolean(),
        })
        .safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: "A valid availability value is required.",
        });
        return;
      }

      const user = getUser(res);
      const database = getDatabase();

      const result = await database.collection("services").updateOne(
        {
          _id: new ObjectId(serviceId),
          technicianEmail: user.email,
        },
        {
          $set: {
            isAvailable: validation.data.isAvailable,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        res.status(404).json({
          success: false,
          message: "Service not found or you do not own this service.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Service availability updated successfully.",
        isAvailable: validation.data.isAvailable,
      });
    } catch (error) {
      console.error("Update service availability error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to update service availability.",
      });
    }
  },
);

export default router;
