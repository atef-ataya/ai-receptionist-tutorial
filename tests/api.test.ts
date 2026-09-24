import request from "supertest";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import type { ServerConfig } from "../server/config.js";
import { DemoBookingStore } from "../server/services/demo-store.js";

const config: ServerConfig = {
  NODE_ENV: "test", APP_MODE: "demo", PORT: 3001, BUSINESS_ID: "velo", BUSINESS_TIMEZONE: "Asia/Dubai",
  GEMINI_LIVE_MODEL: "gemini-3.8-live", ALLOWED_ORIGINS: "http://localhost:5173", allowedOrigins: ["http://localhost:5173"]
};

function testApp() { return createApp(config, new DemoBookingStore()); }

function nextSaturday() {
  const now = DateTime.now().setZone("Asia/Dubai");
  return now.startOf("day").plus({ days: (6 - now.weekday + 7) % 7 || 7 }).toISODate()!;
}

async function availableSlot(app: ReturnType<typeof testApp>) {
  const response = await request(app).post("/api/tools").set("x-demo-uid", "customer-a").send({ name: "list_availability", args: { serviceId: "interior-suv", localDate: nextSaturday(), window: "afternoon" }, callId: "availability-1" }).expect(200);
  return response.body.result.slots[0] as { id: string };
}

async function prepare(app: ReturnType<typeof testApp>, uid: string, slotId: string) {
  const response = await request(app).post("/api/tools").set("x-demo-uid", uid).send({ name: "prepare_booking", args: { serviceId: "interior-suv", slotId, customerName: uid }, callId: `prepare-${uid}` }).expect(200);
  return response.body.result as { id: string };
}

describe("Velo booking API", () => {
  it("returns public business details without private records", async () => {
    const response = await request(testApp()).get("/api/business").expect(200);
    expect(response.body.business.services[0]).toMatchObject({ id: "interior-suv", priceMinor: 35000, durationMinutes: 60 });
    expect(response.body.business.services).toHaveLength(3);
    expect(response.body.business.services.map((service: { id: string }) => service.id)).toEqual(["interior-suv", "exterior-refresh-suv", "ceramic-maintenance-suv"]);
    expect(JSON.stringify(response.body)).not.toContain("Sara M.");
  });

  it("prepares the selected service with its authoritative price", async () => {
    const app = testApp(); const slot = await availableSlot(app);
    const response = await request(app).post("/api/tools").set("x-demo-uid", "customer-a").send({ name: "prepare_booking", args: { serviceId: "ceramic-maintenance-suv", slotId: slot.id, customerName: "Ataya" }, callId: "prepare-ceramic" }).expect(200);
    expect(response.body.result).toMatchObject({ serviceId: "ceramic-maintenance-suv", serviceName: "Ceramic maintenance · SUV", priceMinor: 45000 });
  });

  it("finds future alternatives in one availability search", async () => {
    const app = testApp();
    const response = await request(app).post("/api/tools").set("x-demo-uid", "customer-a").send({ name: "find_next_availability", args: { serviceId: "exterior-refresh-suv", fromLocalDate: nextSaturday(), limit: 3 }, callId: "next-availability" }).expect(200);
    expect(response.body.result.slots.length).toBeGreaterThan(0);
    expect(response.body.result.slots.length).toBeLessThanOrEqual(3);
  });

  it("rejects unknown confirmation fields", async () => {
    const response = await request(testApp()).post("/api/bookings/confirm").send({ proposalId: "proposal", idempotencyKey: crypto.randomUUID(), priceMinor: 1 }).expect(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
  });

  it("confirms once and returns the same receipt for a duplicate retry", async () => {
    const app = testApp(); const slot = await availableSlot(app); const proposal = await prepare(app, "customer-a", slot.id); const key = crypto.randomUUID();
    const first = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: proposal.id, idempotencyKey: key }).expect(200);
    const retry = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: proposal.id, idempotencyKey: key }).expect(200);
    expect(retry.body.booking.id).toBe(first.body.booking.id);
  });

  it("returns the existing receipt when a consumed proposal uses a new retry key", async () => {
    const app = testApp(); const slot = await availableSlot(app); const proposal = await prepare(app, "customer-a", slot.id);
    const first = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: proposal.id, idempotencyKey: crypto.randomUUID() }).expect(200);
    const second = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: proposal.id, idempotencyKey: crypto.randomUUID() }).expect(200);
    expect(second.body.booking.id).toBe(first.body.booking.id);
  });

  it("does not expose a proposal or receipt to another customer", async () => {
    const app = testApp(); const slot = await availableSlot(app); const proposal = await prepare(app, "customer-a", slot.id);
    const forbidden = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-b").send({ proposalId: proposal.id, idempotencyKey: crypto.randomUUID() }).expect(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
  });

  it("persists the corrected customer name from a replacement proposal", async () => {
    const app = testApp(); const slot = await availableSlot(app);
    await prepare(app, "Arthur", slot.id);
    const corrected = await prepare(app, "Atef Ataya", slot.id);
    const response = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "Atef Ataya").send({ proposalId: corrected.id, idempotencyKey: crypto.randomUUID() }).expect(200);
    expect(response.body.booking.customerName).toBe("Atef Ataya");
  });

  it("allows only one of two customers to claim the same slot", async () => {
    const app = testApp(); const slot = await availableSlot(app);
    const [proposalA, proposalB] = await Promise.all([prepare(app, "customer-a", slot.id), prepare(app, "customer-b", slot.id)]);
    const responses = await Promise.all([
      request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: proposalA.id, idempotencyKey: crypto.randomUUID() }),
      request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-b").send({ proposalId: proposalB.id, idempotencyKey: crypto.randomUUID() })
    ]);
    expect(responses.map(item => item.status).sort()).toEqual([200, 409]);
    expect(responses.find(item => item.status === 409)?.body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("rejects reuse of an idempotency key for another proposal", async () => {
    const app = testApp(); const saturday = await availableSlot(app);
    const sundayResponse = await request(app).post("/api/tools").set("x-demo-uid", "customer-a").send({ name: "list_availability", args: { serviceId: "interior-suv", localDate: DateTime.fromISO(nextSaturday()).plus({ days: 1 }).toISODate() }, callId: "availability-2" }).expect(200);
    const first = await prepare(app, "customer-a", saturday.id); const second = await prepare(app, "customer-a", sundayResponse.body.result.slots[0].id); const key = crypto.randomUUID();
    await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: first.id, idempotencyKey: key }).expect(200);
    const conflict = await request(app).post("/api/bookings/confirm").set("x-demo-uid", "customer-a").send({ proposalId: second.id, idempotencyKey: key }).expect(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects state-changing requests from an untrusted browser origin", async () => {
    const response = await request(testApp()).post("/api/tools").set("Origin", "https://attacker.example").send({ name: "get_business_details", args: {}, callId: "origin" }).expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("does not fabricate a Gemini credential in demo mode", async () => {
    const response = await request(testApp()).post("/api/live-token").send({}).expect(503);
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(response.body).not.toHaveProperty("token");
  });
});
