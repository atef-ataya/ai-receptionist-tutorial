import { DateTime } from "luxon";
import { Timestamp } from "firebase-admin/firestore";
import { developmentDb } from "./_admin.js";

const argIndex = process.argv.indexOf("--days");
const days = argIndex >= 0 ? Number(process.argv[argIndex + 1]) : 60;
if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error("--days must be an integer from 1 to 60.");

const openingHours: Record<string, [string, string]> = {
  monday: ["09:00", "17:00"], tuesday: ["09:00", "17:00"], wednesday: ["09:00", "17:00"],
  thursday: ["09:00", "17:00"], friday: ["09:00", "17:00"], saturday: ["09:00", "17:00"], sunday: ["10:00", "16:00"]
};

const { db, projectId } = developmentDb();
const root = db.collection("businesses").doc("velo");
const today = DateTime.now().setZone("Asia/Dubai").startOf("day");
const rangeStart = today.plus({ days: 1 });
const rangeEnd = today.plus({ days: days + 1 });
const existing = await root.collection("slots").where("startsAt", ">=", Timestamp.fromDate(rangeStart.toUTC().toJSDate())).where("startsAt", "<", Timestamp.fromDate(rangeEnd.toUTC().toJSDate())).get();
const existingIds = new Set(existing.docs.map(doc => doc.id));
const fixtureSet = `rolling-${today.toISODate()}-${days}d`;
const writes: Array<{ id: string; start: DateTime; end: DateTime }> = [];

for (let dayOffset = 1; dayOffset <= days; dayOffset++) {
  const day = today.plus({ days: dayOffset });
  const hours = openingHours[day.toFormat("cccc").toLowerCase()];
  if (!hours) continue;
  const startHour = Number(hours[0].slice(0, 2)); const endHour = Number(hours[1].slice(0, 2));
  for (let hour = startHour; hour < endHour; hour++) {
    const start = day.set({ hour }); const end = start.plus({ hours: 1 });
    const id = `bay-1_${start.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`;
    if (!existingIds.has(id)) writes.push({ id, start, end });
  }
}

await root.set({ openingHours, configVersion: 2 }, { merge: true });
for (let offset = 0; offset < writes.length; offset += 400) {
  const batch = db.batch();
  for (const item of writes.slice(offset, offset + 400)) {
    batch.create(root.collection("slots").doc(item.id), {
      resourceId: "bay-1", startsAt: Timestamp.fromDate(item.start.toUTC().toJSDate()), endsAt: Timestamp.fromDate(item.end.toUTC().toJSDate()),
      status: "available", bookingId: null, fixtureSet
    });
  }
  await batch.commit();
}

console.log(`Created ${writes.length} available one-hour slots for the next ${days} days in ${projectId}. Existing slots and bookings were preserved.`);
