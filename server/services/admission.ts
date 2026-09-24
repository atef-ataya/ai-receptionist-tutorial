import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { AppError } from "../errors.js";

export async function admitAction(db: Firestore, businessId: string, uid: string, scope: "live" | "tool" | "confirm", limit: number, windowMs: number) {
  const bucket = Math.floor(Date.now() / windowMs);
  const ref = db.collection("businesses").doc(businessId).collection("admission").doc(`${scope}_${uid}_${bucket}`);
  await db.runTransaction(async transaction => {
    const doc = await transaction.get(ref);
    const count = doc.exists ? Number(doc.data()?.count ?? 0) : 0;
    if (count >= limit) throw new AppError(429, "RATE_LIMITED", "Too many voice sessions. Please try again shortly.");
    transaction.set(ref, { uid, scope, count: count + 1, bucket, expiresAt: Timestamp.fromMillis((bucket + 2) * windowMs), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}
