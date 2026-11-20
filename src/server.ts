
import "dotenv/config";
import app from "./app.js";
import {
  closeDatabase,
  connectDatabase,
} from "./config/database.js";
import { ensurePaymentIndexes } from "./routes/payment.routes.js";

const port = Number(process.env.PORT) || 5000;

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await ensurePaymentIndexes();

    const server = app.listen(port, "0.0.0.0", () => {
      const allowedOrigins = (
        process.env.CLIENT_URL || "http://localhost:3000"
      )
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

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
