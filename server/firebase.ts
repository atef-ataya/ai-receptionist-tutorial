import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { ServerConfig } from "./config.js";

export function getAdminServices(config: ServerConfig) {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: config.FIREBASE_PROJECT_ID });
  return { auth: getAuth(app), db: getFirestore(app) };
}
