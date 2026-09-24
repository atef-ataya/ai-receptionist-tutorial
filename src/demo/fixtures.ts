import type { AvailableSlot, BookingReceipt, Business, Proposal } from "../../shared/contracts";

export const demoBusiness: Business = {
  id: "velo",
  name: "Velo Auto Studio",
  timezone: "Asia/Dubai",
  currency: "AED",
  openingHours: { saturday: ["14:00", "16:00"], sunday: ["09:00", "11:00"] },
  services: [
    { id: "interior-suv", name: "Interior reset", vehicleType: "SUV", priceMinor: 35000, currency: "AED", durationMinutes: 60 },
    { id: "exterior-refresh-suv", name: "Exterior refresh", vehicleType: "SUV", priceMinor: 30000, currency: "AED", durationMinutes: 60 },
    { id: "ceramic-maintenance-suv", name: "Ceramic maintenance", vehicleType: "SUV", priceMinor: 45000, currency: "AED", durationMinutes: 60 }
  ]
};

export const demoSlots: AvailableSlot[] = [
  { id: "bay-1_2026-09-19T11:00:00Z", startsAt: "2026-09-19T11:00:00.000Z", endsAt: "2026-09-19T12:00:00.000Z", timezone: "Asia/Dubai", displayLabel: "Saturday at 3:00 PM" },
  { id: "bay-1_2026-09-20T06:00:00Z", startsAt: "2026-09-20T06:00:00.000Z", endsAt: "2026-09-20T07:00:00.000Z", timezone: "Asia/Dubai", displayLabel: "Sunday at 10:00 AM" }
];

export function makeDemoProposal(slot = demoSlots[1], service = demoBusiness.services[0]): Proposal {
  return {
    id: "demo-proposal-sunday",
    serviceId: service.id,
    slotId: slot.id,
    serviceName: `${service.name} · ${service.vehicleType}`,
    customerName: "Ataya",
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    timezone: "Asia/Dubai",
    priceMinor: service.priceMinor,
    currency: "AED",
    expiresAt: new Date(Date.now() + 120_000).toISOString()
  };
}

export function makeDemoReceipt(proposal: Proposal): BookingReceipt {
  return { ...proposal, id: "VLO-0920-1042", status: "confirmed" };
}

export const demoBookings: BookingReceipt[] = [
  { id: "VLO-0919-1400", status: "confirmed", customerName: "Sara M.", serviceName: "Interior reset · SUV", startsAt: "2026-09-19T10:00:00.000Z", endsAt: "2026-09-19T11:00:00.000Z", timezone: "Asia/Dubai", priceMinor: 35000, currency: "AED" },
  { id: "VLO-0920-0900", status: "confirmed", customerName: "Omar K.", serviceName: "Interior reset · SUV", startsAt: "2026-09-20T05:00:00.000Z", endsAt: "2026-09-20T06:00:00.000Z", timezone: "Asia/Dubai", priceMinor: 35000, currency: "AED" }
];
