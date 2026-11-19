
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^(\+8801|01)[3-9]\d{8}$/),
  area: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(500).optional().default(""),
  image: z.union([z.string().url().max(2048), z.literal("")]).optional().default(""),
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

router.get("/me", authenticate, async (_req, res) => {
  try {
    const user = getUser(res);
    const database = getDatabase();

    const profile = await database.collection("users").findOne(
      { email: user.email },
      {
        projection: {
          password: 0,
          emailVerified: 0,
        },
      },
    );

    if (!profile) {
      res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve your profile.",
    });
  }
});

router.patch("/me", authenticate, async (req, res) => {
  try {
    const validation = profileSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: validation.error.issues[0]?.message,
      });
      return;
    }

    const user = getUser(res);
    const database = getDatabase();

    const updatedProfile = {
      ...validation.data,
      updatedAt: new Date(),
    };

    const result = await database.collection("users").findOneAndUpdate(
      { email: user.email },
      { $set: updatedProfile },
      { returnDocument: "after" },
    );

    if (!result) {
      res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        _id: result._id,
        name: result.name,
        email: result.email,
        role: result.role,
        phone: result.phone || "",
        area: result.area || "",
        bio: result.bio || "",
        image: result.image || "",
        updatedAt: result.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update your profile.",
    });
  }
});

export default router;
