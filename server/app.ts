import { randomUUID } from "node:crypto";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { availabilityArgsSchema, confirmBookingSchema, nextAvailabilityArgsSchema, prepareBookingArgsSchema, toolRequestSchema } from "../shared/contracts.js";
import type { ServerConfig } from "./config.js";
import { AppError, statusForError } from "./errors.js";
import { getAdminServices } from "./firebase.js";
import { identityFrom, requireIdentity } from "./middleware/auth.js";
import { liveSessionConfig } from "./live-config.js";
import { admitAction } from "./services/admission.js";
import { DemoBookingStore } from "./services/demo-store.js";
import { FirestoreBookingStore } from "./services/firestore-store.js";
import type { BookingStore } from "./services/store.js";

export function createApp(config: ServerConfig, storeOverride?: BookingStore) {
  const app = express();
  const demoMode = config.APP_MODE === "demo";
  const admin = demoMode ? null : getAdminServices(config);
  const store = storeOverride ?? (demoMode ? new DemoBookingStore() : new FirestoreBookingStore(admin!.db, config.BUSINESS_ID));
  const auth = requireIdentity(admin?.auth ?? null, demoMode);

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = config.allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.endsWith(".run.app");
      callback(null, isAllowed);
    },
    credentials: false
  }));
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => { res.locals.requestId = req.header("x-request-id") || randomUUID(); res.setHeader("x-request-id", res.locals.requestId); next(); });
  app.use((req, _res, next) => {
    const origin = req.header("origin");
    if (origin && req.method !== "GET") {
      const host = req.get("host");
      const isSameHost = host ? (origin === `http://${host}` || origin === `https://${host}`) : false;
      const isAllowed = config.allowedOrigins.includes(origin) || isSameHost || origin.endsWith(".run.app");
      if (!isAllowed) return next(new AppError(403, "FORBIDDEN", "This request origin is not allowed."));
    }
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, mode: config.APP_MODE }));
  app.get("/api/business", async (_req, res, next) => { try { res.json({ ok: true, business: await store.getBusiness() }); } catch (error) { next(error); } });

  app.post("/api/live-token", auth, async (_req, res, next) => {
    try {
      if (demoMode) throw new AppError(503, "SERVICE_UNAVAILABLE", "Voice is unavailable in demo mode. Configure Firebase and Gemini to enable it.");
      if (!config.GEMINI_API_KEY) throw new AppError(503, "SERVICE_UNAVAILABLE", "Gemini is not configured.");
      const identity = identityFrom(res);
      await admitAction(admin!.db, config.BUSINESS_ID, identity.uid, "live", 5, 10 * 60_000);
      const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
      const token = await ai.authTokens.create({ config: {
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        expireTime: new Date(Date.now() + 5 * 60_000).toISOString(),
        liveConnectConstraints: { model: config.GEMINI_LIVE_MODEL, config: liveSessionConfig }
      }});
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, token: token.name, model: config.GEMINI_LIVE_MODEL });
    } catch (error) { next(error); }
  });

  app.post("/api/tools", auth, async (req, res, next) => {
    try {
      const request = toolRequestSchema.parse(req.body);
      const identity = identityFrom(res);
      if (!demoMode) await admitAction(admin!.db, config.BUSINESS_ID, identity.uid, "tool", 120, 10 * 60_000);
      let result: unknown;
      if (request.name === "get_business_details") result = await store.getBusiness();
      else if (request.name === "list_availability") {
        const args = availabilityArgsSchema.parse(request.args);
        result = { slots: await store.listAvailability(args.serviceId, args.localDate, args.window), timezone: "Asia/Dubai" };
      } else if (request.name === "find_next_availability") {
        const args = nextAvailabilityArgsSchema.parse(request.args);
        result = { slots: await store.findNextAvailability(args.serviceId, args.fromLocalDate, args.window, args.limit), timezone: "Asia/Dubai" };
      } else {
        const args = prepareBookingArgsSchema.parse(request.args);
        result = await store.prepareBooking({ uid: identity.uid, ...args });
      }
      res.json({ ok: true, callId: request.callId, result });
    } catch (error) { next(error); }
  });

  app.post("/api/bookings/confirm", auth, async (req, res, next) => {
    try { const body = confirmBookingSchema.parse(req.body); const identity = identityFrom(res); if (!demoMode) await admitAction(admin!.db, config.BUSINESS_ID, identity.uid, "confirm", 20, 60_000); res.json({ ok: true, booking: await store.confirmBooking({ uid: identity.uid, ...body }) }); }
    catch (error) { next(error); }
  });

  app.get("/api/bookings/:id", auth, async (req, res, next) => {
    try { const identity = identityFrom(res); const owner = identity.admin && identity.businessId === config.BUSINESS_ID; res.json({ ok: true, booking: await store.getBooking(String(req.params.id), identity.uid, owner) }); }
    catch (error) { next(error); }
  });

  if (config.NODE_ENV === "production") {
    const clientDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(clientDir, { index: false, maxAge: "1y", immutable: true }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    const normalized = error instanceof ZodError ? new AppError(400, "INVALID_INPUT", "The request contains invalid or unexpected fields.", error.flatten()) : error instanceof AppError ? error : new AppError(503, "SERVICE_UNAVAILABLE", "The service could not complete the request.");
    const status = statusForError(normalized);
    console.error(JSON.stringify({ level: "error", requestId: res.locals.requestId, method: req.method, path: req.path, status, code: normalized.code, message: normalized.message }));
    res.status(status).json({ ok: false, error: { code: normalized.code, message: normalized.message, requestId: res.locals.requestId, ...(normalized.details ? { details: normalized.details } : {}) } });
  };
  app.use(errorHandler);
  return app;
}
