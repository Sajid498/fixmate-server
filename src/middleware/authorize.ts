
import type { RequestHandler } from "express";

export type UserRole = "customer" | "technician" | "admin";

export const authorize = (
  ...allowedRoles: UserRole[]
): RequestHandler => {
  return (_req, res, next) => {
    const user = res.locals.user as
      | { role: UserRole }
      | undefined;

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
      return;
    }

    next();
  };
};
