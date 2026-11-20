
import "dotenv/config";
import express from "express";
import cors from "cors";
import uploadRoutes from "./routes/upload.routes.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

const corsOptions: cors.CorsOptions = {
  origin: clientUrl.split(",").map((origin) => origin.trim()),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

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

app.use("/api/uploads", uploadRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "FixMate API is running.",
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

app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/technician/bookings", technicianBookingRoutes);
app.use("/api/payments", paymentRoutes);

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await ensurePaymentIndexes();

    const server = app.listen(port, () => {
      console.log(`FixMate server running on port ${port}`);
    });

    const shutdown = async () => {
      console.log("Shutting down FixMate server.");

      server.close(async () => {
        await closeDatabase();
        process.exit(0);
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
