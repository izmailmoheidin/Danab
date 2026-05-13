// One-time migration: backfill `stationCode` into Firestore `stations` docs.
// Source of truth for the IMEI → numeric code mapping is the payment
// system's STATION_<code>_IMEI env vars.
const fs = require("fs");
const path = require("path");

function readEnv(file) {
  return fs.readFileSync(file, "utf8");
}

function getEnv(content, key) {
  const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const adminEnv = readEnv(path.join(__dirname, "..", "danab-admin-main", ".env"));
const paymentEnv = readEnv(path.join(__dirname, "..", "PaymentSystem-main", "local.env"));

const sa = JSON.parse(
  Buffer.from(getEnv(adminEnv, "FIREBASE_CREDENTIALS_B64"), "base64").toString("utf8"),
);

const admin = require(path.join(
  __dirname,
  "..",
  "danab-admin-main",
  "node_modules",
  "firebase-admin",
));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });

// Build IMEI → code map from STATION_<n>_IMEI env vars.
const imeiToCode = {};
const codeRegex = /^STATION_(\d+)_IMEI=(.+)$/gm;
let match;
while ((match = codeRegex.exec(paymentEnv)) !== null) {
  const code = match[1];
  const imei = match[2].trim().replace(/^["']|["']$/g, "");
  imeiToCode[imei] = code;
}
console.log("IMEI → stationCode map from payment env:");
console.log(imeiToCode);

(async () => {
  const db = admin.firestore();
  const snap = await db.collection("stations").get();
  const writes = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const imei = String(d.imei || doc.id);
    const code = imeiToCode[imei];
    if (!code) {
      console.log(`  ⏭  skip ${imei} (no mapping found)`);
      return;
    }
    if (String(d.stationCode || "") === code) {
      console.log(`  ✅ ${imei} already has stationCode=${code}`);
      return;
    }
    writes.push({ ref: doc.ref, code, imei });
  });

  if (writes.length === 0) {
    console.log("\nNothing to backfill.");
    process.exit(0);
  }

  console.log(`\nBackfilling ${writes.length} stations…`);
  const batch = db.batch();
  for (const w of writes) {
    batch.set(w.ref, { stationCode: w.code }, { merge: true });
    console.log(`  ✏️  ${w.imei} → stationCode=${w.code}`);
  }
  await batch.commit();
  console.log("\n✅ Done");
  process.exit(0);
})();
