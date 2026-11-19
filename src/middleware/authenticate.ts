
import type { RequestHandler } from "express";
import { ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDatabase } from "../config/database.js";

const authUrl = process.env.BETTER_AUTH_URL;

if (!authUrl) {
  throw new Error("BETTER_AUTH_URL is missing from the backend environment.");
}

const authBaseUrl = new URL(authUrl).origin;

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", authBaseUrl),
);

export const authenticate: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
      return;
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseUrl,
      audience: authBaseUrl,
      algorithms: ["EdDSA"],
    });

    if (!payload.sub || !ObjectId.isValid(payload.sub)) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication identity.",
      });
      return;
    }

    const database = getDatabase();

    const user = await database.collection("users").findOne(
      { _id: new ObjectId(payload.sub) },
      {
        projection: {
          name: 1,
          email: 1,
          role: 1,
        },
      },
    );

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User account not found.",
      });
      return;
    }

    if (
      !["customer", "technician", "admin"].includes(
        user.role as string,
      )
    ) {
      res.status(403).json({
        success: false,
        message: "User role is not authorized.",
      });
      return;
    }

    res.locals.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
};
