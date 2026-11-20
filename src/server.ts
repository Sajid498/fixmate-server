
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import uploadRoutes from "./routes/upload.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import technicianBookingRoutes from "./routes/technician-booking.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import userRoutes from "./routes/user.routes.js";
import paymentRoutes, { ensurePaymentIndexes } from "./routes/payment.routes.js";
import {
  closeDatabase,
  connectDatabase,
} from "./config/database.js";

const app = express();

const port = Number(process.env.PORT) || 5000;

const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by FixMate CORS policy."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.disable("x-powered-by");

app.use(cors(corsOptions));
app.use(helmet());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "FixMate API is running.",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "FixMate backend and MongoDB are connected.",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/uploads", uploadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/technician/bookings", technicianBookingRoutes);
app.use("/api/payments", paymentRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled API error:", error);

    if (error instanceof Error && error.message.includes("CORS")) {
      res.status(403).json({
        success: false,
        message: "Origin not allowed.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  },
);

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await ensurePaymentIndexes();

    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`FixMate server running on port ${port}`);
      console.log(`Allowed frontend origins: ${allowedOrigins.join(", ")}`);
    });

    let isShuttingDown = false;

    const shutdown = async () => {
      if (isShuttingDown) return;

      isShuttingDown = true;
      console.log("Shutting down FixMate server.");

      server.close(async (error) => {
        if (error) {
          console.error("Server shutdown error:", error);
          process.exitCode = 1;
        }

        await closeDatabase();
        process.exit();
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start FixMate server:", error);
    await closeDatabase();
    process.exit(1);
  }
}

void startServer();
