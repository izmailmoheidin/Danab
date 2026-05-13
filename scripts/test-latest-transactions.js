// Reproduces the exact Firestore query that /api/transactions/latest runs
// to surface the actual error producing the HTTP 500.
const fs = require("fs");
const path = require("path");

const adminEnv = fs.readFileSync(
  path.join(__dirname, "..", "danab-admin-main", ".env"),
  "utf8",
);

function getEnv(content, key) {
  const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const FIREBASE_B64 = getEnv(adminEnv, "FIREBASE_CREDENTIALS_B64");

(async () => {
  const sa = JSON.parse(Buffer.from(FIREBASE_B64, "base64").toString("utf8"));
  const admin = require(path.join(
    __dirname,
    "..",
    "danab-admin-main",
    "node_modules",
    "firebase-admin",
  ));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const db = admin.firestore();
  const Timestamp = admin.firestore.Timestamp;
  const twoDaysAgo = Timestamp.fromDate(
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  );

  console.log("\n→ Running transactions/latest core query against rentalsTrans…");
  try {
    const snap = await db
      .collection("rentalsTrans")
      .where("status", "in", ["rented", "returned"])
      .where("timestamp", ">=", twoDaysAgo)
      .orderBy("timestamp", "desc")
      .limit(30)
      .get();
    console.log(`  ✅ OK — returned ${snap.size} docs`);
  } catch (err) {
    console.log("  ❌ FAILED");
    console.log("  code:    ", err.code);
    console.log("  message: ", err.message);
    if (err.details) console.log("  details: ", err.details);
  }

  console.log("\n→ Running loadOfficialActiveRentals primary query…");
  try {
    const snap = await db
      .collection("battery_state")
      .where("status", "==", "rented")
      .get();
    console.log(`  ✅ OK — returned ${snap.size} battery_state docs`);
  } catch (err) {
    console.log("  ❌ FAILED");
    console.log("  code:    ", err.code);
    console.log("  message: ", err.message);
  }

  console.log("\n→ Running dashboard/summary monthly query…");
  try {
    const now = new Date();
    const somaliaTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const monthStart = new Date(
      Date.UTC(somaliaTime.getUTCFullYear(), somaliaTime.getUTCMonth(), 1) -
        3 * 60 * 60 * 1000,
    );
    const monthEnd = new Date(
      Date.UTC(somaliaTime.getUTCFullYear(), somaliaTime.getUTCMonth() + 1, 1) -
        3 * 60 * 60 * 1000,
    );
    const snap = await db
      .collection("rentalsTrans")
      .where("timestamp", ">=", Timestamp.fromDate(monthStart))
      .where("timestamp", "<", Timestamp.fromDate(monthEnd))
      .where("status", "in", ["rented", "returned"])
      .get();
    console.log(`  ✅ OK — returned ${snap.size} docs (this month)`);
  } catch (err) {
    console.log("  ❌ FAILED");
    console.log("  code:    ", err.code);
    console.log("  message: ", err.message);
  }

  process.exit(0);
})();
