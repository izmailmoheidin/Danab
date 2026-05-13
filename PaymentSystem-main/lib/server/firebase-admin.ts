import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getRequiredEnv } from "@/lib/server/env";

function parseServiceAccount(): ServiceAccount {
  const encoded = getRequiredEnv("FIREBASE_CREDENTIALS_B64");

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    throw new Error("Failed to decode FIREBASE_CREDENTIALS_B64");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Failed to parse Firebase credentials JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid Firebase credentials payload");
  }

  // Fix escaped newlines in private_key
  const serviceAccount = parsed as ServiceAccount & { private_key?: string };
  if (serviceAccount.private_key && typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
}

function getOrCreateFirebaseApp() {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  return initializeApp({
    credential: cert(parseServiceAccount()),
  });
}

export function getDb() {
  return getFirestore(getOrCreateFirebaseApp());
}
