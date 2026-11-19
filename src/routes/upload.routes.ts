
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

const uploadSchema = z.object({
  image: z.string().min(1),
  name: z.string().trim().max(100).optional(),
});

router.post("/image", authenticate, async (req, res) => {
  try {
    const validation = uploadSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "A valid image is required.",
      });
      return;
    }

    const apiKey = process.env.IMGBB_API_KEY;

    if (!apiKey) {
      res.status(503).json({
        success: false,
        message: "Image upload service is not configured.",
      });
      return;
    }

    const imageValue = validation.data.image;
    const dataUriMatch = imageValue.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
    );

    if (!dataUriMatch) {
      res.status(400).json({
        success: false,
        message: "Only JPEG, PNG and WebP images are supported.",
      });
      return;
    }

    const mimeType = dataUriMatch[1];
    const base64Image = dataUriMatch[2];

    if (!mimeType || !base64Image) {
      res.status(400).json({
        success: false,
        message: "Invalid image data.",
      });
      return;
    }

    const imageBuffer = Buffer.from(base64Image, "base64");

    if (imageBuffer.length === 0 || imageBuffer.length > 5 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        message: "Image size must be between 1 byte and 5 MB.",
      });
      return;
    }

    const formData = new URLSearchParams();
    formData.set("image", base64Image);

    if (validation.data.name) {
      formData.set("name", validation.data.name);
    }

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success || !result.data?.url) {
      console.error("ImgBB upload failed:", result);

      res.status(502).json({
        success: false,
        message: "Image upload failed. Please try again.",
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully.",
      data: {
        url: result.data.url,
        displayUrl: result.data.display_url,
        deleteUrl: result.data.delete_url,
      },
    });
  } catch (error) {
    console.error("Image upload error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to upload image.",
    });
  }
});

export default router;
