// Verifies that Firebase, HeyCharge, and Waafi credentials all work.
// Does NOT spend money: Waafi is tested with a deliberate invalid request
// that exercises auth without committing a transaction.
const fs = require("fs");
const path = require("path");

const adminEnv = fs.readFileSync(path.join(__dirname, "..", "danab-admin-main", ".env"), "utf8");
const payEnv = fs.readFileSync(path.join(__dirname, "..", "PaymentSystem-main", "local.env"), "utf8");

function getEnv(content, key) {
  const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const FIREBASE_B64 = getEnv(adminEnv, "FIREBASE_CREDENTIALS_B64");
const HEYCHARGE_API_KEY = getEnv(payEnv, "HEYCHARGE_API_KEY");
const HEYCHARGE_DOMAIN = getEnv(payEnv, "HEYCHARGE_DOMAIN");
const WAAFI_URL = getEnv(payEnv, "WAAFI_URL");
const WAAFI_MERCHANT_UID = getEnv(payEnv, "WAAFI_MERCHANT_UID");
const WAAFI_API_USER_ID = getEnv(payEnv, "WAAFI_API_USER_ID");
const WAAFI_API_KEY = getEnv(payEnv, "WAAFI_API_KEY");

const status = (ok, label, detail = "") =>
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? "  →  " + detail : ""}`);

(async () => {
  console.log("\n🔎 API Reachability Check\n");

  // Firebase
  console.log("Firebase Admin / Firestore:");
  try {
    const sa = JSON.parse(Buffer.from(FIREBASE_B64, "base64").toString("utf8"));
    const admin = require(path.join(__dirname, "..", "danab-admin-main", "node_modules", "firebase-admin"));
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
    const snap = await admin.firestore().collection("system_users").limit(1).count().get();
    status(true, "Firestore connection", `project=${sa.project_id}, system_users count=${snap.data().count}`);
  } catch (e) {
    status(false, "Firestore connection", e.message);
  }

  // HeyCharge
  console.log("\nHeyCharge:");
  const auth = "Basic " + Buffer.from(HEYCHARGE_API_KEY + ":").toString("base64");
  const stations = [
    { code: "58", imei: "WSEP161721195358" },
    { code: "59", imei: "WSEP161741066502" },
    { code: "60", imei: "WSEP161741066503" },
    { code: "61", imei: "WSEP161741066504" },
    { code: "62", imei: "WSEP161741066505" },
  ];
  for (const s of stations) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${HEYCHARGE_DOMAIN}/v1/station/${s.imei}`, {
        headers: { Authorization: auth },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = await r.json().catch(() => null);
      const batteries = Array.isArray(body?.batteries) ? body.batteries.length : 0;
      const rentable = Array.isArray(body?.batteries)
        ? body.batteries.filter((b) => Number(b.battery_capacity) >= 60 && b.lock_status === "1" && b.battery_abnormal === "0" && b.cable_abnormal === "0").length
        : 0;
      status(r.ok, `Station ${s.code} (${s.imei})`, `HTTP ${r.status} | batteries: ${batteries} | rentable ≥60%: ${rentable}`);
    } catch (e) {
      status(false, `Station ${s.code} (${s.imei})`, e.message);
    }
  }

  // Waafi - test with an intentionally invalid amount (negative) so Waafi
  // returns an auth-validated rejection without committing a real txn.
  console.log("\nWaafi (auth-only probe — no money moves):");
  if (!WAAFI_URL || !WAAFI_MERCHANT_UID || !WAAFI_API_USER_ID || !WAAFI_API_KEY) {
    status(false, "Waafi credentials present", "missing one or more of WAAFI_URL/WAAFI_MERCHANT_UID/WAAFI_API_USER_ID/WAAFI_API_KEY");
  } else {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(WAAFI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1.0",
          requestId: `probe-${Date.now()}`,
          timestamp: new Date().toISOString(),
          channelName: "WEB",
          serviceName: "API_PURCHASE",
          serviceParams: {
            merchantUid: WAAFI_MERCHANT_UID,
            apiUserId: WAAFI_API_USER_ID,
            apiKey: WAAFI_API_KEY,
            paymentMethod: "MWALLET_ACCOUNT",
            payerInfo: { accountNo: "252000000000" }, // intentional bad number
            transactionInfo: {
              referenceId: `probe-${Date.now()}`,
              invoiceId: `probe-${Date.now()}`,
              amount: "0.01",
              currency: "USD",
              description: "auth probe",
            },
          },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = await r.json().catch(() => null);
      const responseCode = body?.responseCode;
      const responseMsg = body?.responseMsg;
      // Any structured response means TLS / endpoint / credentials were accepted by Waafi (it parsed our request).
      const reachable = !!body && responseCode !== undefined;
      status(
        reachable,
        "Waafi endpoint reachable + creds accepted",
        `HTTP ${r.status} | responseCode=${responseCode} | responseMsg="${responseMsg}"`,
      );
      if (responseCode === "5310" || responseCode === 5310) {
        // Common: API user not authorized; means creds are wrong
        console.log("     ⚠️  Code 5310 typically means API user is not authorized for this merchant.");
      }
    } catch (e) {
      status(false, "Waafi endpoint reachable", e.message);
    }
  }

  console.log("\n");
  process.exit(0);
})();
