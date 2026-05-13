// Diagnoses why the second payment attempt failed when batteries should be available.
// Reads Firestore state + live HeyCharge data and prints a clear picture.
const fs = require("fs");
const path = require("path");

const adminEnv = fs.readFileSync(path.join(__dirname, "..", "danab-admin-main", ".env"), "utf8");
const payEnv = fs.readFileSync(path.join(__dirname, "..", "PaymentSystem-main", "local.env"), "utf8");
const sa = JSON.parse(Buffer.from(adminEnv.match(/^FIREBASE_CREDENTIALS_B64=(.+)$/m)[1].trim(), "base64").toString("utf8"));
const admin = require(path.join(__dirname, "..", "danab-admin-main", "node_modules", "firebase-admin"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const apiKey = payEnv.match(/^HEYCHARGE_API_KEY=(.+)$/m)[1].trim();
const domain = payEnv.match(/^HEYCHARGE_DOMAIN=(.+)$/m)[1].trim();
const auth = "Basic " + Buffer.from(apiKey + ":").toString("base64");
const TEST_IMEI = "WSEP161721195358"; // Station 58

(async () => {
  console.log("\n=== RENTAL STATE DIAGNOSIS ===\n");

  console.log("[1] Active rentals (status=rented):");
  const rentals = await db.collection("rentalsTrans").where("status", "==", "rented").get();
  if (rentals.empty) console.log("    (none)");
  rentals.forEach((d) => {
    const x = d.data();
    console.log(`    • phone=${x.phoneNumber} battery=${x.battery_id} imei=${x.imei} unlockStatus=${x.unlockStatus} at=${x.timestamp?.toDate?.()?.toISOString?.()}`);
  });

  console.log("\n[2] Battery reservations (should be empty if no payments in flight):");
  const reservations = await db.collection("battery_reservations").get();
  if (reservations.empty) console.log("    (none)");
  reservations.forEach((d) => console.log(`    • ${d.id}  →  ${JSON.stringify(d.data())}`));

  console.log("\n[3] Phone payment locks (should be empty if no payments in flight):");
  const locks = await db.collection("phone_payment_locks").get();
  if (locks.empty) console.log("    (none)");
  locks.forEach((d) => console.log(`    • ${d.id}  →  ${JSON.stringify(d.data())}`));

  console.log("\n[4] Battery state (rented batteries):");
  const states = await db.collection("battery_state").get();
  if (states.empty) console.log("    (none)");
  states.forEach((d) => {
    const x = d.data();
    console.log(`    • battery=${d.id}  status=${x.status}  rentalId=${x.rentalId}`);
  });

  console.log("\n[5] Unresolved problem slots:");
  const ps = await db.collection("problem_slots").where("resolved", "==", false).get();
  if (ps.empty) console.log("    (none)");
  ps.forEach((d) => {
    const x = d.data();
    console.log(`    • imei=${x.imei} slot=${x.slot_id} battery=${x.battery_id} reason="${x.reason}"`);
  });

  console.log("\n[6] LIVE HeyCharge query for station 58:");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`${domain}/v1/station/${TEST_IMEI}`, { headers: { Authorization: auth }, signal: ctrl.signal });
    clearTimeout(t);
    const body = await resp.json().catch(() => null);
    console.log(`    HTTP ${resp.status}`);
    if (Array.isArray(body?.batteries)) {
      console.log(`    ${body.batteries.length} batteries currently in slots:`);
      body.batteries.forEach((b) => {
        const cap = parseInt(b.battery_capacity);
        const rentable = cap >= 60 && b.lock_status === "1" && b.battery_abnormal === "0" && b.cable_abnormal === "0";
        console.log(`      ${rentable ? "✅" : "❌"} slot=${b.slot_id} battery=${b.battery_id} cap=${cap}% lock=${b.lock_status} abnormal=${b.battery_abnormal} cable=${b.cable_abnormal} slot_status="${b.slot_status||""}" battery_status="${b.battery_status||""}"`);
      });
    } else {
      console.log("    body:", JSON.stringify(body));
    }
  } catch (e) {
    console.log("    ERROR:", e.message);
  }

  console.log("\n=== DIAGNOSIS ===");
  if (!rentals.empty) {
    console.log("⚠️  You have an active rental. The payment system blocks new payments until the previous battery is returned (status='rented' → 409 'already has active rental').");
  }
  if (!reservations.empty) {
    console.log("⚠️  Stale battery reservations exist — these block new attempts on the same battery.");
  }
  if (!locks.empty) {
    console.log("⚠️  Stale phone payment locks exist — these block new payments from the same phone.");
  }
  if (!ps.empty) {
    console.log("⚠️  Some slots are flagged as problem slots — those batteries are excluded from selection.");
  }
  console.log("");

  process.exit(0);
})();
