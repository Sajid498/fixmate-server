
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

const getServiceId = (value: string | string[] | undefined): string | null => {
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return value;
};

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

router.get("/", async (_req, res) => {
  try {
    const database = getDatabase();

    const services = await database
      .collection("services")
      .find({
        approvalStatus: "approved",
        isAvailable: true,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: services.length,
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


router.get("/", async (req, res) => {
  try {
    const database = getDatabase();

    const escapeRegex = (value: string): string =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const getQueryValue = (value: unknown): string | undefined =>
      typeof value === "string" ? value.trim() : undefined;

    const search = getQueryValue(req.query.search);
    const category = getQueryValue(req.query.category);
    const serviceMode = getQueryValue(req.query.serviceMode);
    const serviceArea = getQueryValue(req.query.serviceArea);
    const sort = getQueryValue(req.query.sort) || "newest";

    const requestedPage = Number(req.query.page) || 1;
    const requestedLimit = Number(req.query.limit) || 12;

    const page = Math.max(1, Math.floor(requestedPage));
    const limit = Math.min(24, Math.max(1, Math.floor(requestedLimit)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    if (category && serviceCategories.includes(category as (typeof serviceCategories)[number])) {
      filter.category = category;
    }

    if (
      serviceMode &&
      ["Home Visit", "Shop Drop-off"].includes(serviceMode)
    ) {
      filter.serviceMode = serviceMode;
    }

    if (serviceArea) {
      filter.serviceArea = {
        $regex: escapeRegex(serviceArea),
        $options: "i",
      };
    }

    if (search) {
      const searchRegex = {
        $regex: escapeRegex(search),
        $options: "i",
      };

      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
        { technicianName: searchRegex },
        { serviceArea: searchRegex },
      ];
    }

    const sortOptions: Record<string, 1 | -1> = {
      newest: -1,
      "price-low": 1,
      "price-high": -1,
    };

    const sortField =
      sort === "price-low" || sort === "price-high"
        ? "basePrice"
        : "createdAt";

    const sortDirection = sortOptions[sort] || -1;

    const [services, total] = await Promise.all([
      database
        .collection("services")
        .find(filter)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limit)
        .toArray(),
      database.collection("services").countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: services.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + services.length < total,
        hasPreviousPage: page > 1,
      },
      filters: {
        search: search || null,
        category: category || null,
        serviceMode: serviceMode || null,
        serviceArea: serviceArea || null,
        sort,
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
