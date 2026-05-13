// One-shot seeder for the danab-74939 Firestore.
// Creates: 5 stations, ~30 rentalsTrans (mix of rented/returned across today + month),
// 2 problem_slots, 2 blacklist entries.
//
// Run: node seed-test-data.js
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(
  __dirname,
  "danab-admin-main",
  ".env",
);
const envContent = fs.readFileSync(ENV_PATH, "utf8");
const m = envContent.match(/^FIREBASE_CREDENTIALS_B64=(.+)$/m);
if (!m) throw new Error("FIREBASE_CREDENTIALS_B64 not found in admin .env");
const serviceAccount = JSON.parse(
  Buffer.from(m[1].trim().replace(/^["']|["']$/g, ""), "base64").toString("utf8"),
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
const Timestamp = admin.firestore.Timestamp;

const STATIONS = [
  { imei: "WSEP161721195358", code: "58", name: "Castello Taleex", iccid: "8925211000000005800", location: "Taleex, Mogadishu" },
  { imei: "WSEP161741066502", code: "59", name: "Castello Boondhere", iccid: "8925211000000005900", location: "Boondhere, Mogadishu" },
  { imei: "WSEP161741066503", code: "60", name: "Java Taleex", iccid: "8925211000000006000", location: "Taleex, Mogadishu" },
  { imei: "WSEP161741066504", code: "61", name: "Java Airport", iccid: "8925211000000006100", location: "Aden Adde Intl Airport" },
  { imei: "WSEP161741066505", code: "62", name: "Dilek Somalia", iccid: "8925211000000006200", location: "KM4, Mogadishu" },
];

const PHONES = [
  "615123456",
  "617888777",
  "619112233",
  "612555444",
  "614999111",
  "618333222",
  "615666555",
  "613444777",
];

function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function seedStations() {
  const batch = db.batch();
  const now = new Date();
  for (const s of STATIONS) {
    const ref = db.collection("stations").doc(s.imei);
    batch.set(ref, {
      imei: s.imei,
      code: s.code,
      name: s.name,
      iccid: s.iccid,
      location: s.location,
      totalSlots: 6,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
  console.log(`✅ Seeded ${STATIONS.length} stations`);
}

async function seedRentals() {
  const now = Date.now();
  const rentals = [];

  // 12 rentals across today (some rented, some returned)
  for (let i = 0; i < 12; i++) {
    const station = randItem(STATIONS);
    const phone = randItem(PHONES);
    const hoursAgo = randInt(0, 20);
    const tsMs = now - hoursAgo * 60 * 60 * 1000;
    const status = i % 3 === 0 ? "rented" : "returned";
    rentals.push({
      imei: station.imei,
      stationCode: station.code,
      battery_id: `BAT${randInt(10000, 99999)}`,
      slot_id: String(randInt(1, 6)),
      phoneNumber: phone,
      requestedPhoneNumber: phone,
      phoneAuthority: "waafi_confirmed_full_match",
      amount: randItem([0.25, 0.5, 1.0]),
      status,
      unlockStatus: "unlocked",
      transactionId: `TXN${Date.now()}${i}`,
      issuerTransactionId: `ITXN${Date.now()}${i}`,
      referenceId: `ref-${tsMs}-${i}`,
      timestamp: Timestamp.fromMillis(tsMs),
      ...(status === "returned"
        ? { returnedAt: Timestamp.fromMillis(tsMs + randInt(30, 240) * 60 * 1000) }
        : {}),
      waafiAccountNo: `252${phone}`,
      waafiConfirmedPhoneNumber: phone,
    });
  }

  // 18 rentals spread across this month (older days)
  for (let i = 0; i < 18; i++) {
    const station = randItem(STATIONS);
    const phone = randItem(PHONES);
    const daysAgo = randInt(1, 25);
    const tsMs = now - daysAgo * 24 * 60 * 60 * 1000;
    const status = "returned";
    rentals.push({
      imei: station.imei,
      stationCode: station.code,
      battery_id: `BAT${randInt(10000, 99999)}`,
      slot_id: String(randInt(1, 6)),
      phoneNumber: phone,
      requestedPhoneNumber: phone,
      phoneAuthority: "waafi_confirmed_full_match",
      amount: randItem([0.25, 0.5, 1.0, 2.0]),
      status,
      unlockStatus: "unlocked",
      transactionId: `TXN${Date.now()}${i}_m`,
      issuerTransactionId: `ITXN${Date.now()}${i}_m`,
      referenceId: `ref-${tsMs}-m${i}`,
      timestamp: Timestamp.fromMillis(tsMs),
      returnedAt: Timestamp.fromMillis(tsMs + randInt(30, 360) * 60 * 1000),
      waafiAccountNo: `252${phone}`,
      waafiConfirmedPhoneNumber: phone,
    });
  }

  // Commit in chunks of 500 (Firestore batch limit)
  const collection = db.collection("rentalsTrans");
  let written = 0;
  for (let i = 0; i < rentals.length; i += 400) {
    const batch = db.batch();
    const slice = rentals.slice(i, i + 400);
    for (const r of slice) {
      const ref = collection.doc();
      batch.set(ref, r);
    }
    await batch.commit();
    written += slice.length;
  }
  console.log(`✅ Seeded ${written} rentalsTrans (${rentals.filter(r => r.status === "rented").length} active, ${rentals.filter(r => r.status === "returned").length} returned)`);
}

async function seedProblemSlots() {
  const batch = db.batch();
  const now = new Date();
  const problems = [
    {
      imei: STATIONS[0].imei,
      slot_id: "3",
      battery_id: "BAT12345",
      reason: "Battery jammed in slot",
      resolved: false,
      createdAt: now,
    },
    {
      imei: STATIONS[2].imei,
      slot_id: "5",
      battery_id: "BAT67890",
      reason: "Cable damage detected",
      resolved: false,
      createdAt: now,
    },
  ];
  for (const p of problems) {
    batch.set(db.collection("problem_slots").doc(), p);
  }
  await batch.commit();
  console.log(`✅ Seeded ${problems.length} problem_slots`);
}

async function seedBlacklist() {
  const batch = db.batch();
  const now = new Date();
  const entries = [
    {
      phoneNumber: "612000111",
      reason: "Repeated battery damage",
      addedBy: "system",
      createdAt: now,
    },
    {
      phoneNumber: "613000222",
      reason: "Failed to return rental for 30+ days",
      addedBy: "system",
      createdAt: now,
    },
  ];
  for (const e of entries) {
    batch.set(db.collection("blacklist").doc(e.phoneNumber), e);
  }
  await batch.commit();
  console.log(`✅ Seeded ${entries.length} blacklist entries`);
}

(async () => {
  console.log("🌱 Seeding test data into project:", serviceAccount.project_id);
  await seedStations();
  await seedRentals();
  await seedProblemSlots();
  await seedBlacklist();
  console.log("\n🎉 Done. Refresh the admin dashboard.");
  process.exit(0);
})().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
