// Tiny HTTP mock server emulating HeyCharge + Waafi.
// State is configured per-scenario via POST /__set
// Listens on port 9001 by default.
const http = require("http");

const PORT = Number(process.env.MOCK_PORT || 9001);

let state = {
  // HeyCharge
  station: {
    // imei -> { batteries: [{battery_id, slot_id, battery_capacity, lock_status, ...}] }
  },
  // Whether the unlock command should "succeed" at HTTP level
  unlockHttpStatus: 200,
  // Whether the unlock command should physically remove the battery
  // ("eject"=remove, "stuck"=leave it in place, "missing"=already gone before unlock)
  unlockBehavior: "eject",
  // Waafi
  waafi: {
    purchaseResponseCode: "2001",
    purchaseState: "APPROVED",
    purchaseTransactionId: null, // auto-generated if null
    reverseResponseCode: "2001",
    reverseState: "APPROVED",
  },
  // Counters for asserting interaction
  counters: {
    heychargeQueries: 0,
    heychargeUnlocks: 0,
    waafiPurchases: 0,
    waafiReversals: 0,
  },
};

function reset() {
  state = {
    station: {},
    unlockHttpStatus: 200,
    unlockBehavior: "eject",
    waafi: {
      purchaseResponseCode: "2001",
      purchaseState: "APPROVED",
      purchaseTransactionId: null,
      reverseResponseCode: "2001",
      reverseState: "APPROVED",
    },
    counters: { heychargeQueries: 0, heychargeUnlocks: 0, waafiPurchases: 0, waafiReversals: 0 },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // --- Control plane -------------------------------------------------------
  if (path === "/__set" && method === "POST") {
    const body = await readBody(req);
    try {
      const patch = JSON.parse(body);
      state = { ...state, ...patch, counters: { ...state.counters, ...(patch.counters || {}) } };
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 400, { error: "invalid json" });
    }
  }
  if (path === "/__reset" && method === "POST") {
    reset();
    return send(res, 200, { ok: true });
  }
  if (path === "/__state" && method === "GET") {
    return send(res, 200, state);
  }

  // --- HeyCharge: GET /v1/station/:imei -----------------------------------
  const stationGetMatch = path.match(/^\/v1\/station\/([^/]+)$/);
  if (stationGetMatch && method === "GET") {
    state.counters.heychargeQueries += 1;
    const imei = stationGetMatch[1];
    if (state.stationOfflineForImei && state.stationOfflineForImei === imei) {
      return send(res, 402, { error: "Subscription expired (mock)" });
    }
    const stationData = state.station[imei] || { batteries: [] };
    return send(res, 200, { imei, iccid: "", slot_num: "", batteries: stationData.batteries });
  }

  // --- HeyCharge: POST /v1/station/:imei?battery_id=...&slot_id=... -------
  if (stationGetMatch && method === "POST") {
    state.counters.heychargeUnlocks += 1;
    const imei = stationGetMatch[1];
    const batteryId = url.searchParams.get("battery_id");
    const slotId = url.searchParams.get("slot_id");
    const station = state.station[imei];

    if (state.unlockHttpStatus !== 200) {
      return send(res, state.unlockHttpStatus, { error: "Unlock failed (mock)" });
    }
    if (state.unlockBehavior === "eject" && station) {
      // Physically remove the battery from the slot
      station.batteries = station.batteries.filter(
        (b) => !(b.battery_id === batteryId && b.slot_id === slotId),
      );
    }
    // "stuck" → battery stays in place. HTTP 200 returned anyway.
    // "missing" → battery already gone (no-op)
    return send(res, 200, { result: "success", battery_id: batteryId, slot_id: slotId });
  }

  // --- Waafi: POST / (any path under /waafi)  -----------------------------
  if (method === "POST" && path === "/waafi") {
    const bodyText = await readBody(req);
    let body = {};
    try { body = JSON.parse(bodyText); } catch {}
    const serviceName = body?.serviceName;
    if (serviceName === "API_PURCHASE") {
      state.counters.waafiPurchases += 1;
      const txnId = state.waafi.purchaseTransactionId || `WMOCK${Date.now()}`;
      return send(res, 200, {
        schemaVersion: "1.0",
        timestamp: new Date().toISOString(),
        responseId: `R${Date.now()}`,
        responseCode: state.waafi.purchaseResponseCode,
        errorCode: state.waafi.purchaseResponseCode === "2001" ? "0" : "5004",
        responseMsg: state.waafi.purchaseState === "APPROVED" ? "Approved" : "Declined",
        params: {
          state: state.waafi.purchaseState,
          transactionId: state.waafi.purchaseState === "APPROVED" ? txnId : null,
          issuerTransactionId: state.waafi.purchaseState === "APPROVED" ? `I${txnId}` : null,
          referenceId: body?.serviceParams?.transactionInfo?.referenceId || null,
          accountNo: body?.serviceParams?.payerInfo?.accountNo || null,
          accountType: "MWALLET",
          merchantCharges: "0",
          txAmount: body?.serviceParams?.transactionInfo?.amount || null,
        },
      });
    }
    if (serviceName === "API_REVERSAL") {
      state.counters.waafiReversals += 1;
      return send(res, 200, {
        schemaVersion: "1.0",
        timestamp: new Date().toISOString(),
        responseId: `RR${Date.now()}`,
        responseCode: state.waafi.reverseResponseCode,
        errorCode: state.waafi.reverseResponseCode === "2001" ? "0" : "5004",
        responseMsg: state.waafi.reverseState === "APPROVED" ? "Reversed" : "Reversal failed",
        params: {
          state: state.waafi.reverseState,
          transactionId: body?.serviceParams?.transactionId || null,
        },
      });
    }
    return send(res, 400, { error: "unknown serviceName" });
  }

  send(res, 404, { error: "not found", path, method });
});

server.listen(PORT, () => {
  console.log(`Mock server listening on http://localhost:${PORT}`);
});
