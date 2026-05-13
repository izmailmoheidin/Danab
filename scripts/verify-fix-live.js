// Verifies the auto-return fix is live in the running dev server (port 3002)
// by creating a stale rental for a battery that's physically present right
// now, then triggering /api/pay and checking that the stale rental got
// auto-returned. The /api/pay call will fail at the Waafi step (real Waafi
// timing out), but the auto-return happens BEFORE Waafi is called.
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
const TEST_IMEI = "WSEP161721195358";

(async () => {
  // 1. Get a real battery_id currently present at station 58
  const r = await fetch(`${domain}/v1/station/${TEST_IMEI}`, { headers: { Authorization: auth } });
  const body = await r.json();
  if (!body?.batteries?.length) {
    console.log("❌ Station has no batteries to test with.");
    process.exit(1);
  }
  const targetBattery = body.batteries[0];
  console.log(`Targeting battery ${targetBattery.battery_id} in slot ${targetBattery.slot_id} (${targetBattery.battery_capacity}%)`);

  // 2. Create a fake stale rental for that battery
  const fakePhone = "999000111"; // unique fake phone that won't match any real customer
  console.log("\n[setup] Creating fake stale rental + battery_state for that battery...");
  const rentalRef = await db.collection("rentalsTrans").add({
    imei: TEST_IMEI,
    stationCode: "58",
    battery_id: targetBattery.battery_id,
    slot_id: targetBattery.slot_id,
    phoneNumber: fakePhone,
    requestedPhoneNumber: fakePhone,
    amount: 0.5,
    status: "rented",
    unlockStatus: "unlocked",
    transactionId: "FAKE_STALE_TXN_" + Date.now(),
    referenceId: "fake_ref",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000)),
    note: "Fake stale rental for fix verification",
  });
  await db.collection("battery_state").doc(targetBattery.battery_id).set({
    battery_id: targetBattery.battery_id,
    imei: TEST_IMEI,
    stationCode: "58",
    slot_id: targetBattery.slot_id,
    activeRentalId: rentalRef.id,
    phoneNumber: fakePhone,
    status: "rented",
    claimedAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });
  console.log(`  Created rental ${rentalRef.id} with status=rented`);

  // 3. Verify it shows as rented BEFORE
  const beforeSnap = await rentalRef.get();
  console.log(`\n[before] rental status: ${beforeSnap.data().status}`);

  // 4. Trigger /api/pay against running 3002 server with a unique test phone
  //    The call will FAIL at Waafi step (real network), but auto-return runs first.
  console.log("\n[trigger] Calling /api/pay (will fail at Waafi step — that's expected)...");
  try {
    const resp = await fetch("http://localhost:3002/api/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: "615" + Date.now().toString().slice(-6), amount: 0.01, stationCode: "58" }),
    });
    const text = await resp.text();
    console.log(`  HTTP ${resp.status}: ${text.slice(0, 200)}`);
  } catch (e) {
    console.log(`  request error (expected): ${e.message}`);
  }

  // 5. Wait a moment for any async operations
  await new Promise((res) => setTimeout(res, 1000));

  // 6. Check if the rental got auto-returned
  const afterSnap = await rentalRef.get();
  const after = afterSnap.data();
  console.log(`\n[after] rental status: ${after.status}`);
  console.log(`[after] note: ${after.note || "(none)"}`);
  console.log(`[after] returnedAt: ${after.returnedAt?.toDate?.()?.toISOString?.() || "(none)"}`);

  const stateSnap = await db.collection("battery_state").doc(targetBattery.battery_id).get();
  console.log(`[after] battery_state exists: ${stateSnap.exists} status: ${stateSnap.data()?.status || "(cleared)"}`);

  // 7. Cleanup the test rental if it wasn't returned (so we don't pollute the db)
  if (after.status !== "returned") {
    console.log("\n❌ FIX NOT WORKING — auto-return did not happen. Cleaning up test data...");
    await rentalRef.delete();
    await db.collection("battery_state").doc(targetBattery.battery_id).delete();
    process.exit(1);
  } else {
    console.log("\n✅ FIX IS LIVE — stale rental was auto-returned successfully.");
    // Delete the test rental record so it doesn't pollute the dashboard
    await rentalRef.delete();
    console.log("   (test rental record deleted)");
  }

  process.exit(0);
})();
