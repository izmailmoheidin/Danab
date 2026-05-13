// Updates each station doc in Firestore using ONLY real data from HeyCharge.
// - totalSlots: from HeyCharge `slot_num` field, or null if API doesn't provide it
// - observedMaxSlot: highest slot_id seen in batteries
// - iccid, online, lastBatteryCount, lastSeenAt: live from HeyCharge
const fs = require("fs");
const path = require("path");

const adminEnv = fs.readFileSync(
  path.join(__dirname, "..", "danab-admin-main", ".env"),
  "utf8",
);
const payEnv = fs.readFileSync(
  path.join(__dirname, "..", "PaymentSystem-main", "local.env"),
  "utf8",
);

const apiKey = payEnv.match(/^HEYCHARGE_API_KEY=(.+)$/m)[1]
  .trim().replace(/^["']|["']$/g, "");
const domain = payEnv.match(/^HEYCHARGE_DOMAIN=(.+)$/m)[1]
  .trim().replace(/^["']|["']$/g, "");
const auth = "Basic " + Buffer.from(apiKey + ":").toString("base64");

const sa = JSON.parse(
  Buffer.from(adminEnv.match(/^FIREBASE_CREDENTIALS_B64=(.+)$/m)[1].trim(), "base64").toString("utf8"),
);
const admin = require(path.join(__dirname, "..", "danab-admin-main", "node_modules", "firebase-admin"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const stations = await db.collection("stations").get();
  for (const d of stations.docs) {
    const data = d.data();
    let r = null;
    try {
      const resp = await fetch(`${domain}/v1/station/${data.imei}`, { headers: { Authorization: auth } });
      if (resp.ok) r = await resp.json();
    } catch {}
    const apiSlotNum = r && r.slot_num && Number(r.slot_num) > 0 ? Number(r.slot_num) : null;
    const maxSlotSeen = r && Array.isArray(r.batteries) && r.batteries.length
      ? Math.max(...r.batteries.map((b) => Number(b.slot_id) || 0)) : 0;
    const update = {
      totalSlots: apiSlotNum,
      observedMaxSlot: maxSlotSeen || null,
      iccid: r && typeof r.iccid === "string" ? r.iccid : "",
      online: !!r,
      lastBatteryCount: r && Array.isArray(r.batteries) ? r.batteries.length : 0,
      lastSeenAt: r ? new Date() : null,
      updatedAt: new Date(),
    };
    await d.ref.set(update, { merge: true });
    console.log(
      `${data.code} | ${data.imei} | totalSlots: ${apiSlotNum} | observedMaxSlot: ${maxSlotSeen} | iccid: ${update.iccid || "(none)"}`,
    );
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
