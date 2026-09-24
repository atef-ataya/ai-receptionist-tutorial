import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import type { AvailableSlot, BookingReceipt, Business, Proposal, Service } from "../../shared/contracts.js";
import { AppError } from "../errors.js";
import type { BookingStore, ConfirmInput, PrepareInput } from "./store.js";

type DbService = Service & { active: boolean; version: number; sortOrder?: number };

export class FirestoreBookingStore implements BookingStore {
  private root;
  constructor(private db: Firestore, private businessId = "velo") { this.root = db.collection("businesses").doc(businessId); }

  async getBusiness(): Promise<Business> {
    const [businessDoc, serviceSnap] = await Promise.all([this.root.get(), this.root.collection("services").where("active", "==", true).get()]);
    if (!businessDoc.exists) throw new AppError(503, "SERVICE_UNAVAILABLE", "Business configuration is unavailable.");
    const record = businessDoc.data()!;
    const services = serviceSnap.docs.map(doc => { const item = doc.data(); return { order: item.sortOrder ?? 99, service: { id: doc.id, name: item.name, vehicleType: item.vehicleType, priceMinor: item.priceMinor, currency: "AED", durationMinutes: item.durationMinutes } satisfies Service }; }).sort((a, b) => a.order - b.order).map(item => item.service);
    return { id: "velo", name: record.name, timezone: "Asia/Dubai", currency: "AED", openingHours: record.openingHours ?? {}, services };
  }

  async listAvailability(serviceId: string, localDate: string, window?: "morning" | "afternoon") {
    const start = DateTime.fromISO(localDate, { zone: "Asia/Dubai" }).startOf("day");
    if (!start.isValid || start < DateTime.now().setZone("Asia/Dubai").startOf("day") || start > DateTime.now().plus({ days: 60 })) throw new AppError(400, "INVALID_INPUT", "Choose a date within the next 60 days.");
    const [service, snap] = await Promise.all([
      this.root.collection("services").doc(serviceId).get(),
      this.root.collection("slots").where("startsAt", ">=", Timestamp.fromDate(start.toUTC().toJSDate())).where("startsAt", "<", Timestamp.fromDate(start.plus({ days: 1 }).toUTC().toJSDate())).orderBy("startsAt").get()
    ]);
    if (!service.exists || service.data()?.active !== true) throw new AppError(400, "INVALID_INPUT", "The requested service does not exist.");
    return snap.docs.filter(doc => { const data = doc.data(); const hour = (data.startsAt as Timestamp).toDate(); const localHour = DateTime.fromJSDate(hour).setZone("Asia/Dubai").hour; return data.status === "available" && (!window || (window === "morning" ? localHour < 12 : localHour >= 12)); }).map(doc => {
      const data = doc.data(); const starts = (data.startsAt as Timestamp).toDate(); const ends = (data.endsAt as Timestamp).toDate();
      return { id: doc.id, startsAt: starts.toISOString(), endsAt: ends.toISOString(), timezone: "Asia/Dubai" as const, displayLabel: DateTime.fromJSDate(starts).setZone("Asia/Dubai").toFormat("cccc 'at' h:mm a") };
    });
  }

  async findNextAvailability(serviceId: string, fromLocalDate: string, window?: "morning" | "afternoon", limit = 3) {
    const start = DateTime.fromISO(fromLocalDate, { zone: "Asia/Dubai" }).startOf("day");
    const today = DateTime.now().setZone("Asia/Dubai").startOf("day");
    if (!start.isValid || start < today || start > today.plus({ days: 60 })) throw new AppError(400, "INVALID_INPUT", "Choose a date within the next 60 days.");
    const end = DateTime.min(start.plus({ days: 30 }), today.plus({ days: 61 }));
    const [service, snap] = await Promise.all([
      this.root.collection("services").doc(serviceId).get(),
      this.root.collection("slots").where("status", "==", "available").where("startsAt", ">=", Timestamp.fromDate(start.toUTC().toJSDate())).where("startsAt", "<", Timestamp.fromDate(end.toUTC().toJSDate())).orderBy("startsAt").limit(Math.max(limit * 4, 12)).get()
    ]);
    if (!service.exists || service.data()?.active !== true) throw new AppError(400, "INVALID_INPUT", "The requested service does not exist.");
    return snap.docs.filter(doc => {
      const data = doc.data(); const localHour = DateTime.fromJSDate((data.startsAt as Timestamp).toDate()).setZone("Asia/Dubai").hour;
      return !window || (window === "morning" ? localHour < 12 : localHour >= 12);
    }).slice(0, limit).map(doc => {
      const data = doc.data(); const starts = (data.startsAt as Timestamp).toDate(); const ends = (data.endsAt as Timestamp).toDate();
      return { id: doc.id, startsAt: starts.toISOString(), endsAt: ends.toISOString(), timezone: "Asia/Dubai" as const, displayLabel: DateTime.fromJSDate(starts).setZone("Asia/Dubai").toFormat("cccc, d LLL 'at' h:mm a") };
    });
  }

  async prepareBooking(input: PrepareInput) {
    const [businessDoc, serviceDoc, slotDoc] = await Promise.all([this.root.get(), this.root.collection("services").doc(input.serviceId).get(), this.root.collection("slots").doc(input.slotId).get()]);
    if (!businessDoc.exists || !serviceDoc.exists || !slotDoc.exists) throw new AppError(400, "INVALID_INPUT", "The selected service or slot does not exist.");
    const service = serviceDoc.data() as DbService; const slot = slotDoc.data()!;
    if (!service.active || slot.status !== "available") throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment is no longer available.");
    const proposalRef = this.root.collection("proposals").doc(); const startsAt = slot.startsAt as Timestamp; const endsAt = slot.endsAt as Timestamp; const expiresAt = Timestamp.fromMillis(Date.now() + 120_000);
    const proposal: Proposal = { id: proposalRef.id, serviceId: input.serviceId, slotId: input.slotId, serviceName: `${service.name} · ${service.vehicleType}`, customerName: input.customerName, startsAt: startsAt.toDate().toISOString(), endsAt: endsAt.toDate().toISOString(), timezone: "Asia/Dubai", priceMinor: service.priceMinor, currency: "AED", expiresAt: expiresAt.toDate().toISOString() };
    await proposalRef.create({ uid: input.uid, serviceId: input.serviceId, slotId: input.slotId, customerName: input.customerName, configVersion: businessDoc.data()!.configVersion, serviceVersion: service.version, priceMinor: service.priceMinor, currency: service.currency, startsAt, endsAt, expiresAt, consumedBookingId: null, fixtureSet: businessDoc.data()!.fixtureSet ?? null, createdAt: FieldValue.serverTimestamp() });
    return proposal;
  }

  async confirmBooking(input: ConfirmInput) {
    const proposalRef = this.root.collection("proposals").doc(input.proposalId);
    const requestRef = this.root.collection("requests").doc(`${input.uid}_${input.idempotencyKey}`);
    const candidateBookingRef = this.root.collection("bookings").doc(`VLO-${randomUUID().slice(0, 8).toUpperCase()}`);
    return this.db.runTransaction(async transaction => {
      const [requestDoc, proposalDoc] = await Promise.all([transaction.get(requestRef), transaction.get(proposalRef)]);
      if (requestDoc.exists) { const prior = requestDoc.data()!; if (prior.proposalId !== input.proposalId) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This retry key was already used for another proposal."); return prior.receipt as BookingReceipt; }
      if (!proposalDoc.exists || proposalDoc.data()!.uid !== input.uid) throw new AppError(403, "FORBIDDEN", "You cannot confirm this proposal.");
      const proposal = proposalDoc.data()!;
      if (proposal.consumedBookingId) { const existing = await transaction.get(this.root.collection("bookings").doc(proposal.consumedBookingId)); if (!existing.exists || existing.data()!.uid !== input.uid) throw new AppError(403, "FORBIDDEN", "You cannot view this booking."); return existing.data()!.receipt as BookingReceipt; }
      if ((proposal.expiresAt as Timestamp).toMillis() <= Date.now()) throw new AppError(410, "PROPOSAL_EXPIRED", "This proposal has expired.");
      const serviceRef = this.root.collection("services").doc(proposal.serviceId); const slotRef = this.root.collection("slots").doc(proposal.slotId);
      const [businessDoc, serviceDoc, slotDoc] = await Promise.all([transaction.get(this.root), transaction.get(serviceRef), transaction.get(slotRef)]);
      if (!businessDoc.exists || !serviceDoc.exists || !slotDoc.exists) throw new AppError(409, "PROPOSAL_STALE", "The business configuration changed. Please prepare a new proposal.");
      const service = serviceDoc.data() as DbService; const slot = slotDoc.data()!;
      if (businessDoc.data()!.configVersion !== proposal.configVersion || service.version !== proposal.serviceVersion || service.priceMinor !== proposal.priceMinor || !service.active) throw new AppError(409, "PROPOSAL_STALE", "The service details changed. Please prepare a new proposal.");
      const startsAt = slot.startsAt as Timestamp; const endsAt = slot.endsAt as Timestamp; const business = businessDoc.data()!;
      const validDuration = endsAt.toMillis() - startsAt.toMillis() === service.durationMinutes * 60_000;
      const validResource = Array.isArray(business.resourceIds) && business.resourceIds.includes(slot.resourceId);
      const matchesProposal = startsAt.toMillis() === (proposal.startsAt as Timestamp).toMillis() && endsAt.toMillis() === (proposal.endsAt as Timestamp).toMillis();
      const localStart = DateTime.fromJSDate(startsAt.toDate()).setZone("Asia/Dubai");
      const weekday = localStart.toFormat("cccc").toLowerCase(); const hours = business.openingHours?.[weekday];
      const minutes = localStart.hour * 60 + localStart.minute;
      const validOpeningHours = Array.isArray(hours) && hours.length === 2 && minutes >= Number(hours[0].slice(0, 2)) * 60 + Number(hours[0].slice(3)) && minutes + service.durationMinutes <= Number(hours[1].slice(0, 2)) * 60 + Number(hours[1].slice(3));
      if (!validDuration || !validResource || !matchesProposal || !validOpeningHours) throw new AppError(409, "PROPOSAL_STALE", "The appointment details are no longer valid. Please prepare a new proposal.");
      if (slot.status !== "available" || startsAt.toMillis() <= Date.now()) throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment is no longer available.");
      const receipt: BookingReceipt = { id: candidateBookingRef.id, status: "confirmed", serviceName: `${service.name} · ${service.vehicleType}`, customerName: proposal.customerName, startsAt: (slot.startsAt as Timestamp).toDate().toISOString(), endsAt: (slot.endsAt as Timestamp).toDate().toISOString(), timezone: "Asia/Dubai", priceMinor: service.priceMinor, currency: "AED" };
      transaction.create(candidateBookingRef, { uid: input.uid, customerName: proposal.customerName, serviceId: proposal.serviceId, serviceName: receipt.serviceName, resourceId: slot.resourceId, slotId: proposal.slotId, startsAt: slot.startsAt, endsAt: slot.endsAt, priceMinor: receipt.priceMinor, currency: "AED", status: "confirmed", createdAt: FieldValue.serverTimestamp(), proposalId: input.proposalId, source: "web_voice", receipt, fixtureSet: proposal.fixtureSet ?? null });
      transaction.update(slotRef, { status: "booked", bookingId: candidateBookingRef.id });
      transaction.update(proposalRef, { consumedBookingId: candidateBookingRef.id });
      transaction.create(requestRef, { uid: input.uid, idempotencyKey: input.idempotencyKey, proposalId: input.proposalId, bookingId: candidateBookingRef.id, receipt, fixtureSet: proposal.fixtureSet ?? null, createdAt: FieldValue.serverTimestamp() });
      return receipt;
    });
  }

  async getBooking(id: string, uid: string, owner: boolean) {
    const doc = await this.root.collection("bookings").doc(id).get();
    if (!doc.exists) throw new AppError(404, "NOT_FOUND", "Booking not found.");
    const data = doc.data()!;
    if (!owner && data.uid !== uid) throw new AppError(403, "FORBIDDEN", "You cannot view this booking.");
    return data.receipt as BookingReceipt;
  }
}
