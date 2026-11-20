
import type {
  ErrorRequestHandler,
  RequestHandler,
} from "express";

export const apiNotFoundHandler: RequestHandler = (
  _req,
  res,
) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
};

export const apiErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (
    error instanceof Error &&
    error.message.includes("CORS")
  ) {
    res.status(403).json({
      success: false,
      message: "Origin not allowed.",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid JSON request body.",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({
      success: false,
      message: "Request body exceeds the allowed size.",
    });
    return;
  }

  console.error("Unhandled API error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
};
