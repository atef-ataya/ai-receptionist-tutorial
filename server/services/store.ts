import type { AvailableSlot, BookingReceipt, Business, Proposal } from "../../shared/contracts.js";

export type PrepareInput = { uid: string; serviceId: string; slotId: string; customerName: string };
export type ConfirmInput = { uid: string; proposalId: string; idempotencyKey: string };

export interface BookingStore {
  getBusiness(): Promise<Business>;
  listAvailability(serviceId: string, localDate: string, window?: "morning" | "afternoon"): Promise<AvailableSlot[]>;
  findNextAvailability(serviceId: string, fromLocalDate: string, window?: "morning" | "afternoon", limit?: number): Promise<AvailableSlot[]>;
  prepareBooking(input: PrepareInput): Promise<Proposal>;
  confirmBooking(input: ConfirmInput): Promise<BookingReceipt>;
  getBooking(id: string, uid: string, owner: boolean): Promise<BookingReceipt>;
}
