import { DateTime } from "luxon";
import { Timestamp } from "firebase-admin/firestore";
import { developmentDb } from "./_admin.js";

const argIndex = process.argv.indexOf("--saturday");
const value = argIndex >= 0 ? process.argv[argIndex + 1] : undefined;
if (!value) throw new Error("Usage: npm run seed -- --saturday YYYY-MM-DD");
const saturday = DateTime.fromISO(value, { zone: "Asia/Dubai" }).startOf("day");
if (!saturday.isValid || saturday.weekday !== 6 || saturday <= DateTime.now().setZone("Asia/Dubai").startOf("day")) throw new Error("--saturday must be an explicit future Saturday in Asia/Dubai.");

const { db, projectId } = developmentDb();
const business = db.collection("businesses").doc("velo");
const batch = db.batch();

batch.set(business, {
  name: "Velo Auto Studio", timezone: "Asia/Dubai", currency: "AED", configVersion: 1,
  openingHours: { monday: ["09:00", "17:00"], tuesday: ["09:00", "17:00"], wednesday: ["09:00", "17:00"], thursday: ["09:00", "17:00"], friday: ["09:00", "17:00"], saturday: ["09:00", "17:00"], sunday: ["10:00", "16:00"] }, resourceIds: ["bay-1"], fixtureSet: value
});
batch.set(business.collection("services").doc("interior-suv"), { name: "Interior reset", vehicleType: "SUV", priceMinor: 35000, currency: "AED", durationMinutes: 60, active: true, version: 1, sortOrder: 1, fixtureSet: value });
batch.set(business.collection("services").doc("exterior-refresh-suv"), { name: "Exterior refresh", vehicleType: "SUV", priceMinor: 30000, currency: "AED", durationMinutes: 60, active: true, version: 1, sortOrder: 2, fixtureSet: value });
batch.set(business.collection("services").doc("ceramic-maintenance-suv"), { name: "Ceramic maintenance", vehicleType: "SUV", priceMinor: 45000, currency: "AED", durationMinutes: 60, active: true, version: 1, sortOrder: 3, fixtureSet: value });

const definitions = [
  { start: saturday.set({ hour: 14 }), status: "booked", customerName: "Sara M." },
  { start: saturday.set({ hour: 15 }), status: "available" },
  { start: saturday.plus({ days: 1 }).set({ hour: 9 }), status: "booked", customerName: "Omar K." },
  { start: saturday.plus({ days: 1 }).set({ hour: 10 }), status: "available" }
] as const;

for (const definition of definitions) {
  const start = definition.start.toUTC(); const end = start.plus({ hours: 1 });
  const slotId = `bay-1_${start.toFormat("yyyyMMdd'T'HHmmss'Z'")}`;
  const bookingId = definition.status === "booked" ? `VLO-${definition.start.toFormat("MMdd-HHmm")}` : null;
  batch.set(business.collection("slots").doc(slotId), { resourceId: "bay-1", startsAt: Timestamp.fromDate(start.toJSDate()), endsAt: Timestamp.fromDate(end.toJSDate()), status: definition.status, bookingId, fixtureSet: value });
  if (bookingId && "customerName" in definition) {
    const receipt = { id: bookingId, status: "confirmed", customerName: definition.customerName, serviceName: "Interior reset · SUV", startsAt: start.toISO(), endsAt: end.toISO(), timezone: "Asia/Dubai", priceMinor: 35000, currency: "AED" };
    batch.set(business.collection("bookings").doc(bookingId), { uid: "fixture-owner", customerName: definition.customerName, serviceId: "interior-suv", serviceName: receipt.serviceName, resourceId: "bay-1", slotId, startsAt: Timestamp.fromDate(start.toJSDate()), endsAt: Timestamp.fromDate(end.toJSDate()), priceMinor: 35000, currency: "AED", status: "confirmed", proposalId: "fixture", source: "fixture", receipt, fixtureSet: value });
  }
}

await batch.commit();
console.log(`Seeded Velo fixture ${value} in ${projectId}.`);
