const fs = require("fs");
const path = require("path");
const adminEnv = fs.readFileSync(
  path.join(__dirname, "..", "danab-admin-main", ".env"),
  "utf8",
);
const sa = JSON.parse(
  Buffer.from(
    adminEnv.match(/^FIREBASE_CREDENTIALS_B64=(.+)$/m)[1].trim(),
    "base64",
  ).toString("utf8"),
);
const admin = require(path.join(
  __dirname,
  "..",
  "danab-admin-main",
  "node_modules",
  "firebase-admin",
));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  const db = admin.firestore();
  for (const code of ["58", "59", "60", "61", "62"]) {
    try {
      const snap = await db
        .collection("rentalsTrans")
        .where("stationCode", "==", code)
        .where("status", "in", ["rented", "returned"])
        .get();
      console.log(`  ✅ stationCode=${code}  rentals=${snap.size}`);
    } catch (err) {
      console.log(`  ❌ stationCode=${code}  ${err.code} ${err.message.split("\n")[0]}`);
    }
  }
  process.exit(0);
})();
