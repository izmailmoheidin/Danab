// Cleanup fake test data, then load REAL station data from HeyCharge API.
// - Deletes everything in: stations, rentalsTrans, problem_slots, blacklist,
//   battery_state, battery_reservations, phone_payment_locks, admin_login_challenges
// - Keeps: system_users
// - For each STATION_XX_IMEI in PaymentSystem-main/local.env, queries HeyCharge
//   and writes a real station doc with live battery info.
//
// rentalsTrans, problem_slots, blacklist remain empty afterwards: there is no
// API source for these — they only get populated by real customer activity.
//
// Run: node reset-and-load-real.js
const fs = require("fs");
const path = require("path");

const ADMIN_ENV = path.join(__dirname, "danab-admin-main", ".env");
const PAYMENT_ENV = path.join(__dirname, "PaymentSystem-main", "local.env");

function readEnv(file) {
  const content = fs.readFileSync(file, "utf8");
  const out = {};
  const comments = {};
  let lastComment = null;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      lastComment = trimmed.replace(/^#\s*/, "");
      continue;
    }
    const m = trimmed.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) {
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      if (lastComment) comments[m[1]] = lastComment;
      lastComment = null;
    } else if (!trimmed) {
      lastComment = null;
    }
  }
  return { vars: out, comments };
}

const adminEnv = readEnv(ADMIN_ENV);
const payEnv = readEnv(PAYMENT_ENV);

const serviceAccount = JSON.parse(
  Buffer.from(adminEnv.vars.FIREBASE_CREDENTIALS_B64, "base64").toString("utf8"),
);

const admin = require(path.join(
  __dirname,
  "danab-admin-main",
  "node_modules",
  "firebase-admin",
));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const HEYCHARGE_API_KEY = payEnv.vars.HEYCHARGE_API_KEY;
const HEYCHARGE_DOMAIN = payEnv.vars.HEYCHARGE_DOMAIN;

if (!HEYCHARGE_API_KEY || !HEYCHARGE_DOMAIN) {
  throw new Error("Missing HEYCHARGE_API_KEY or HEYCHARGE_DOMAIN in PaymentSystem-main/local.env");
}

const heychargeAuth =
  "Basic " + Buffer.from(`${HEYCHARGE_API_KEY}:`).toString("base64");

// --- Helpers ---------------------------------------------------------------

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`   ${name}: already empty`);
    return 0;
  }
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(400, snap.docs.length - i);
  }
  console.log(`   ${name}: deleted ${deleted} docs`);
  return deleted;
}

async function queryStation(imei) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const res = await fetch(url, { headers: { Authorization: heychargeAuth } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

function extractStationConfig() {
  // Find STATION_<n>_IMEI keys in the payment env.
  const stations = [];
  for (const [key, value] of Object.entries(payEnv.vars)) {
    const m = key.match(/^STATION_(\d+)_IMEI$/);
    if (!m) continue;
    const code = m[1];
    const comment = payEnv.comments[key] || "";
    // Comments look like: "Station 58 - Castello Taleex"
    const nameMatch = comment.match(/^\s*Station\s+\d+\s*[-–]\s*(.+)$/i);
    const name = nameMatch ? nameMatch[1].trim() : `Station ${code}`;
    stations.push({ code, imei: value.trim(), name });
  }
  // Also support the legacy single-station fallback.
  if (
    stations.length === 0 &&
    payEnv.vars.STATION_IMEI &&
    payEnv.vars.STATION_CODE
  ) {
    stations.push({
      code: String(payEnv.vars.STATION_CODE).trim(),
      imei: String(payEnv.vars.STATION_IMEI).trim(),
      name: `Station ${payEnv.vars.STATION_CODE}`,
    });
  }
  return stations;
}

// --- Steps -----------------------------------------------------------------

async function cleanupFakeData() {
  console.log("\n🧹 Cleaning fake/test data…");
  const collections = [
    "stations",
    "rentalsTrans",
    "problem_slots",
    "blacklist",
    "battery_state",
    "battery_reservations",
    "phone_payment_locks",
    "admin_login_challenges",
  ];
  for (const c of collections) {
    await deleteCollection(c);
  }
}

async function loadRealStations() {
  console.log("\n🌐 Loading real station data from HeyCharge…");
  const configured = extractStationConfig();
  if (configured.length === 0) {
    console.log("   No STATION_XX_IMEI entries found in local.env");
    return 0;
  }

  let written = 0;
  let unreachable = 0;
  for (const s of configured) {
    process.stdout.write(`   Station ${s.code} (${s.imei}, ${s.name})… `);
    let liveData = null;
    try {
      const r = await queryStation(s.imei);
      if (r.status === 200 && r.body && typeof r.body === "object") {
        liveData = r.body;
      } else {
        process.stdout.write(`unreachable (status ${r.status}) `);
        unreachable += 1;
      }
    } catch (e) {
      process.stdout.write(`error (${e.message}) `);
      unreachable += 1;
    }

    const batteries = Array.isArray(liveData?.batteries) ? liveData.batteries : [];
    const totalSlots =
      Number.parseInt(liveData?.slot_num, 10) > 0
        ? Number.parseInt(liveData.slot_num, 10)
        : Math.max(batteries.length, 6);

    const now = new Date();
    const doc = {
      imei: s.imei,
      code: s.code,
      name: s.name,
      iccid: typeof liveData?.iccid === "string" ? liveData.iccid : "",
      location: "", // owner can set later via admin UI
      totalSlots,
      // Live snapshot fields (informational)
      lastSeenAt: liveData ? now : null,
      lastBatteryCount: batteries.length,
      online: Boolean(liveData),
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("stations").doc(s.imei).set(doc);
    written += 1;
    console.log(
      `→ saved (slots: ${totalSlots}, batteries present: ${batteries.length})`,
    );
  }

  console.log(
    `\n   ✅ Wrote ${written} real station(s) to Firestore` +
      (unreachable > 0 ? ` (${unreachable} unreachable)` : ""),
  );
  return written;
}

(async () => {
  console.log("Project:", serviceAccount.project_id);
  await cleanupFakeData();
  await loadRealStations();
  console.log(
    "\n📌 Note: rentalsTrans, problem_slots, and blacklist are intentionally" +
      "\n   left empty. These collections only get populated by real" +
      "\n   customer payments via the Payment System (Waafi + HeyCharge)." +
      "\n   Run a real payment from the Payment System UI to create the" +
      "\n   first rentalsTrans entry.",
  );
  process.exit(0);
})().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
