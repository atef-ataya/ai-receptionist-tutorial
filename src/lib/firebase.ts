import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const mode = import.meta.env.VITE_APP_MODE ?? "demo";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

function requireFirebaseConfig() {
  if (mode !== "live") throw new Error("Firebase is only initialized in live mode.");
  const missing = Object.entries(firebaseConfig).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing Firebase configuration: ${missing.join(", ")}`);
  return firebaseConfig as Record<string, string>;
}

export function firebaseServices() {
  const app = getApps().length ? getApp() : initializeApp(requireFirebaseConfig());
  return { app, auth: getAuth(app), db: getFirestore(app) };
}

export async function ensureAnonymousUser(): Promise<User> {
  const { auth } = firebaseServices();
  if (auth.currentUser) return auth.currentUser;
  await new Promise<void>(resolve => { const unsubscribe = onAuthStateChanged(auth, () => { unsubscribe(); resolve(); }); });
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export async function signInOwner() {
  const { auth } = firebaseServices();
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());
  await credential.user.getIdToken(true);
  const claims = (await credential.user.getIdTokenResult()).claims;
  if (claims.admin !== true || claims.businessId !== "velo") {
    await signOut(auth);
    throw new Error("This Google account has not been granted Velo owner access.");
  }
  return credential.user;
}

export async function signOutOwner() { await signOut(firebaseServices().auth); }
