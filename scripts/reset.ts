import { developmentDb } from "./_admin.js";

const argIndex = process.argv.indexOf("--fixture");
const fixtureSet = argIndex >= 0 ? process.argv[argIndex + 1] : undefined;
if (!fixtureSet) throw new Error("Usage: npm run reset -- --fixture YYYY-MM-DD");
const { db, projectId } = developmentDb();
const root = db.collection("businesses").doc("velo");
const collections = ["slots", "bookings", "proposals", "requests"];
let removed = 0;
for (const collection of collections) {
  const snapshot = await root.collection(collection).where("fixtureSet", "==", fixtureSet).get();
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    const batch = db.batch();
    snapshot.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  removed += snapshot.size;
}
console.log(`Removed ${removed} documents from fixture ${fixtureSet} in ${projectId}. Other records were untouched.`);
