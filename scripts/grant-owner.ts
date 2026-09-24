import { loadEnvFile } from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const uidIndex = process.argv.indexOf("--uid");
const ownerUid = uidIndex >= 0 ? process.argv[uidIndex + 1] : undefined;
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!ownerUid || !projectId) throw new Error("Usage: FIREBASE_PROJECT_ID=... npm run grant-owner -- --uid FIREBASE_UID");
const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const user = await auth.getUser(ownerUid);
await auth.setCustomUserClaims(ownerUid, { ...user.customClaims, admin: true, businessId: "velo" });
console.log(`Granted owner access for UID ${ownerUid} in ${projectId}. The user must refresh their ID token or sign in again.`);
