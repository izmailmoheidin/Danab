import admin from "firebase-admin";

// Use globalThis to survive Next.js dev mode hot reloads
const globalForFirebase = globalThis as unknown as {
  _firebaseApp: admin.app.App | undefined;
  _firestoreDb: FirebaseFirestore.Firestore | undefined;
};

function getDb(): FirebaseFirestore.Firestore {
  // Return cached Firestore instance if it exists
  if (globalForFirebase._firestoreDb) {
    return globalForFirebase._firestoreDb;
  }

  // Initialize Firebase app if not already done
  if (!admin.apps.length) {
    const credentialsB64 = process.env.FIREBASE_CREDENTIALS_B64;
    if (!credentialsB64) {
      throw new Error("Missing FIREBASE_CREDENTIALS_B64 environment variable");
    }

    let serviceAccount: admin.ServiceAccount;
    try {
      const decoded = Buffer.from(credentialsB64, "base64").toString("utf8");
      // Parse the JSON and fix escaped newlines in private_key
      const parsed = JSON.parse(decoded);
      if (parsed.private_key && typeof parsed.private_key === "string") {
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      }
      serviceAccount = parsed;
    } catch (err: any) {
      throw new Error("Invalid FIREBASE_CREDENTIALS_B64: " + err.message);
    }

    globalForFirebase._firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin SDK initialized");
  }

  // Create Firestore instance and cache it globally
  const firestore = admin.firestore();
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() already called — safe to ignore
  }
  globalForFirebase._firestoreDb = firestore;
  console.log("✅ Firestore instance ready");

  return firestore;
}

// Lazy proxy — defers initialization until first actual Firestore call
const db = new Proxy({} as FirebaseFirestore.Firestore, {
  get(_target, prop) {
    const realDb = getDb();
    const value = (realDb as any)[prop];
    if (typeof value === "function") {
      return value.bind(realDb);
    }
    return value;
  },
});

export { admin, db };
export default db;
