import { z } from "zod";

export const businessId = "velo" as const;
export const businessTimezone = "Asia/Dubai" as const;

export const serviceSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  vehicleType: z.string().min(1).max(80),
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("AED"),
  durationMinutes: z.number().int().positive().max(480)
}).strict();

export const businessSchema = z.object({
  id: z.literal("velo"),
  name: z.string(),
  timezone: z.literal("Asia/Dubai"),
  currency: z.literal("AED"),
  openingHours: z.record(z.string(), z.tuple([z.string(), z.string()])),
  services: z.array(serviceSchema)
}).strict();

export const availabilityArgsSchema = z.object({
  serviceId: z.string().min(1).max(80),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  window: z.enum(["morning", "afternoon"]).optional()
}).strict();

export const nextAvailabilityArgsSchema = z.object({
  serviceId: z.string().min(1).max(80),
  fromLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  window: z.enum(["morning", "afternoon"]).optional(),
  limit: z.number().int().min(1).max(6).default(3)
}).strict();

export const slotSchema = z.object({
  id: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.literal("Asia/Dubai"),
  displayLabel: z.string()
}).strict();

export const prepareBookingArgsSchema = z.object({
  serviceId: z.string().min(1).max(80),
  slotId: z.string().min(1).max(180),
  customerName: z.string().trim().min(1).max(80)
}).strict();

export const proposalSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  slotId: z.string(),
  serviceName: z.string(),
  customerName: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.literal("Asia/Dubai"),
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("AED"),
  expiresAt: z.string().datetime()
}).strict();

export const confirmBookingSchema = z.object({
  proposalId: z.string().min(1).max(180),
  idempotencyKey: z.string().uuid()
}).strict();

export const bookingReceiptSchema = z.object({
  id: z.string(),
  status: z.literal("confirmed"),
  serviceName: z.string(),
  customerName: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.literal("Asia/Dubai"),
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("AED")
}).strict();

export const toolRequestSchema = z.object({
  name: z.enum(["get_business_details", "list_availability", "find_next_availability", "prepare_booking"]),
  args: z.record(z.string(), z.unknown()),
  callId: z.string().min(1).max(180)
}).strict();

export const apiErrorCodeSchema = z.enum([
  "INVALID_INPUT", "AUTH_REQUIRED", "FORBIDDEN", "NOT_FOUND", "SLOT_UNAVAILABLE",
  "PROPOSAL_STALE", "PROPOSAL_EXPIRED", "IDEMPOTENCY_CONFLICT", "RATE_LIMITED",
  "SERVICE_UNAVAILABLE"
]);

export type Service = z.infer<typeof serviceSchema>;
export type Business = z.infer<typeof businessSchema>;
export type AvailableSlot = z.infer<typeof slotSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type BookingReceipt = z.infer<typeof bookingReceiptSchema>;
export type ToolRequest = z.infer<typeof toolRequestSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export type ApiErrorBody = {
  ok: false;
  error: { code: ApiErrorCode; message: string; requestId?: string; details?: unknown };
};
