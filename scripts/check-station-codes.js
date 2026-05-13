const fs = require("fs");
const path = require("path");
const adminEnv = fs.readFileSync(
  path.join(__dirname, "..", "danab-admin-main", ".env"),
  "utf8",
);
const m = adminEnv.match(/^FIREBASE_CREDENTIALS_B64=(.+)$/m);
const sa = JSON.parse(Buffer.from(m[1].trim(), "base64").toString("utf8"));
const admin = require(path.join(
  __dirname,
  "..",
  "danab-admin-main",
  "node_modules",
  "firebase-admin",
));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  const snap = await admin.firestore().collection("stations").get();
  console.log(`stations collection has ${snap.size} docs:\n`);
  snap.forEach((doc) => {
    const d = doc.data();
    console.log(`  docId=${doc.id}  imei=${d.imei || "-"}  stationCode=${d.stationCode || "(missing)"}  name=${d.name || "-"}`);
  });
  process.exit(0);
})();
