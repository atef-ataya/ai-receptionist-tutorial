import type { NextFunction, Request, Response } from "express";
import type { Auth } from "firebase-admin/auth";
import { AppError } from "../errors.js";

export type RequestIdentity = { uid: string; admin: boolean; businessId?: string };

export function requireIdentity(auth: Auth | null, demoMode: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (demoMode) {
        res.locals.identity = { uid: req.header("x-demo-uid") || "demo-customer", admin: false } satisfies RequestIdentity;
        next();
        return;
      }
      const value = req.header("authorization");
      if (!value?.startsWith("Bearer ")) throw new AppError(401, "AUTH_REQUIRED", "A Firebase ID token is required.");
      const decoded = await auth!.verifyIdToken(value.slice(7), true);
      res.locals.identity = {
        uid: decoded.uid,
        admin: decoded.admin === true,
        businessId: typeof decoded.businessId === "string" ? decoded.businessId : undefined
      } satisfies RequestIdentity;
      next();
    } catch (error) {
      next(error instanceof AppError ? error : new AppError(401, "AUTH_REQUIRED", "The authentication token is invalid or expired."));
    }
  };
}

export function identityFrom(res: Response): RequestIdentity {
  return res.locals.identity as RequestIdentity;
}
