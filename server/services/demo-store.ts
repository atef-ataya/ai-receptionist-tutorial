import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { AvailableSlot, BookingReceipt, Business, Proposal } from "../../shared/contracts.js";
import { AppError } from "../errors.js";
import type { BookingStore, ConfirmInput, PrepareInput } from "./store.js";

const business: Business = {
  id: "velo", name: "Velo Auto Studio", timezone: "Asia/Dubai", currency: "AED",
  openingHours: { saturday: ["14:00", "16:00"], sunday: ["09:00", "11:00"] },
  services: [
    { id: "interior-suv", name: "Interior reset", vehicleType: "SUV", priceMinor: 35000, currency: "AED", durationMinutes: 60 },
    { id: "exterior-refresh-suv", name: "Exterior refresh", vehicleType: "SUV", priceMinor: 30000, currency: "AED", durationMinutes: 60 },
    { id: "ceramic-maintenance-suv", name: "Ceramic maintenance", vehicleType: "SUV", priceMinor: 45000, currency: "AED", durationMinutes: 60 }
  ]
};

function nextWeekendSlots(): AvailableSlot[] {
  const now = DateTime.now().setZone("Asia/Dubai");
  let saturday = now.startOf("day").plus({ days: (6 - now.weekday + 7) % 7 || 7 });
  return [saturday.set({ hour: 15 }), saturday.plus({ days: 1 }).set({ hour: 10 })].map(start => ({
    id: `bay-1_${start.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`,
    startsAt: start.toUTC().toISO()!, endsAt: start.plus({ hours: 1 }).toUTC().toISO()!, timezone: "Asia/Dubai",
    displayLabel: start.toFormat("cccc 'at' h:mm a")
  }));
}

export class DemoBookingStore implements BookingStore {
  private slots = new Map(nextWeekendSlots().map(slot => [slot.id, { slot, booked: false }]));
  private proposals = new Map<string, Proposal & { uid: string; consumedBookingId?: string }>();
  private bookings = new Map<string, BookingReceipt & { uid: string }>();
  private requests = new Map<string, { proposalId: string; receipt: BookingReceipt }>();

  async getBusiness() { return business; }

  async listAvailability(serviceId: string, localDate: string, window?: "morning" | "afternoon") {
    if (!business.services.some(service => service.id === serviceId)) throw new AppError(400, "INVALID_INPUT", "The requested service does not exist.");
    return [...this.slots.values()].filter(({ slot, booked }) => {
      const local = DateTime.fromISO(slot.startsAt).setZone("Asia/Dubai");
      return !booked && local.toISODate() === localDate && (!window || (window === "morning" ? local.hour < 12 : local.hour >= 12));
    }).map(value => value.slot);
  }

  async findNextAvailability(serviceId: string, fromLocalDate: string, window?: "morning" | "afternoon", limit = 3) {
    if (!business.services.some(service => service.id === serviceId)) throw new AppError(400, "INVALID_INPUT", "The requested service does not exist.");
    const start = DateTime.fromISO(fromLocalDate, { zone: "Asia/Dubai" }).startOf("day");
    return [...this.slots.values()].filter(({ slot, booked }) => {
      const local = DateTime.fromISO(slot.startsAt).setZone("Asia/Dubai");
      return !booked && local >= start && (!window || (window === "morning" ? local.hour < 12 : local.hour >= 12));
    }).sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt)).slice(0, limit).map(value => value.slot);
  }

  async prepareBooking(input: PrepareInput) {
    const slotRecord = this.slots.get(input.slotId);
    if (!slotRecord || slotRecord.booked) throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment is no longer available.");
    const service = business.services.find(item => item.id === input.serviceId);
    if (!service) throw new AppError(400, "INVALID_INPUT", "The requested service does not exist.");
    const proposal: Proposal & { uid: string } = {
      id: randomUUID(), uid: input.uid, serviceId: input.serviceId, slotId: input.slotId,
      serviceName: `${service.name} · ${service.vehicleType}`, customerName: input.customerName, startsAt: slotRecord.slot.startsAt,
      endsAt: slotRecord.slot.endsAt, timezone: "Asia/Dubai", priceMinor: service.priceMinor, currency: "AED",
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    };
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  async confirmBooking(input: ConfirmInput) {
    const requestKey = `${input.uid}:${input.idempotencyKey}`;
    const prior = this.requests.get(requestKey);
    if (prior) {
      if (prior.proposalId !== input.proposalId) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This retry key was already used for another proposal.");
      return prior.receipt;
    }
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal || proposal.uid !== input.uid) throw new AppError(403, "FORBIDDEN", "You cannot confirm this proposal.");
    if (proposal.consumedBookingId) return this.bookings.get(proposal.consumedBookingId)!;
    if (new Date(proposal.expiresAt).getTime() <= Date.now()) throw new AppError(410, "PROPOSAL_EXPIRED", "This proposal has expired.");
    const slotRecord = this.slots.get(proposal.slotId);
    if (!slotRecord || slotRecord.booked) throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment is no longer available.");
    const id = `VLO-${randomUUID().slice(0, 8).toUpperCase()}`;
    const receipt: BookingReceipt = { id, status: "confirmed", serviceName: proposal.serviceName, customerName: proposal.customerName, startsAt: proposal.startsAt, endsAt: proposal.endsAt, timezone: proposal.timezone, priceMinor: proposal.priceMinor, currency: proposal.currency };
    slotRecord.booked = true; proposal.consumedBookingId = id;
    this.bookings.set(id, { ...receipt, uid: input.uid });
    this.requests.set(requestKey, { proposalId: input.proposalId, receipt });
    return receipt;
  }

  async getBooking(id: string, uid: string, owner: boolean) {
    const booking = this.bookings.get(id);
    if (!booking) throw new AppError(404, "NOT_FOUND", "Booking not found.");
    if (!owner && booking.uid !== uid) throw new AppError(403, "FORBIDDEN", "You cannot view this booking.");
    const { uid: _privateUid, ...receipt } = booking;
    return receipt;
  }
}
