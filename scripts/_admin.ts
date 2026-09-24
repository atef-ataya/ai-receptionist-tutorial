import { loadEnvFile } from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

export function developmentDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const allowedProjectId = process.env.DEVELOPMENT_PROJECT_ID;
  if (!projectId || !allowedProjectId || projectId !== allowedProjectId || process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing development data operation. FIREBASE_PROJECT_ID must equal DEVELOPMENT_PROJECT_ID and ALLOW_DEMO_SEED must be true.");
  }
  if (/prod|production/i.test(projectId)) throw new Error("Refusing to modify a project whose ID looks like production.");
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  return { db: getFirestore(app), projectId };
}
