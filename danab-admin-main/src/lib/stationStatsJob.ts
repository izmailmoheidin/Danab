import { admin } from "./firebase-admin";
import db from "./firebase-admin";
import axios from "axios";
import {
  ActiveRentalRow,
  getTrustedRentalPhone,
} from "./activeRentals";
import {
  clearBatteryStateIfCurrent,
  synchronizeBatteryStateFromActiveRentals,
} from "./batteryState";
import { normalizeBatteryId } from "./batteryId";
import { cacheComponent } from "./cacheComponent";
import { RENTALS_COLLECTION } from "./rentalsCollection";

const MACHINE_CAPACITY = 8;
const MIN_RENTABLE_BATTERY_PERCENT = 60;
const ALL_STATIONS = [
  "WSEP161721195358",
  "WSEP161741066504",
  "WSEP161741066505",
  "WSEP161741066502",
  "WSEP161741066503",
];

// Only active stations (the others return HTTP 402 — shut down)
export const ACTIVE_STATIONS = ["WSEP161741066502", "WSEP161741066503"];

const stationCache: Record<string, any> = {};

function normalizeHeyChargeState(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isHealthyHeyChargeState(value?: string | null) {
  const normalized = normalizeHeyChargeState(value);

  if (!normalized) {
    return true;
  }

  return [
    "normal",
    "online",
    "available",
    "ok",
    "healthy",
    "1",
  ].includes(normalized);
}

// Update a single station — used by round-robin cron
export async function updateSingleStation(imei: string) {
  const HEYCHARGE_API_KEY = process.env.HEYCHARGE_API_KEY;
  const HEYCHARGE_DOMAIN = process.env.HEYCHARGE_DOMAIN;

  if (!HEYCHARGE_API_KEY || !HEYCHARGE_DOMAIN) {
    console.log(
      "⚠️ HeyCharge credentials not configured, skipping station stats update",
    );
    return { success: false, message: "HeyCharge credentials not configured" };
  }

  const now = admin.firestore.Timestamp.now();

  try {
    // 1. Fetch live station data from HeyCharge
    const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
    const { data } = await axios.get(url, {
      auth: { username: HEYCHARGE_API_KEY, password: "" },
      timeout: 5000,
    });

    const rawBatteries = data.batteries || [];
    const station_status =
      data.station_status === "Offline" ? "Offline" : "Online";

    // 2. Load station metadata
    const doc = await db.collection("stations").doc(imei).get();
    const meta = doc.exists ? doc.data() || {} : {};

    stationCache[imei] = {
      ...stationCache[imei],
      iccid: meta.iccid || stationCache[imei]?.iccid || "",
    };

    // 3. If offline, write offline snapshot
    if (station_status === "Offline") {
      console.log(`⚠️ Station ${imei} is offline`);
      await db
        .collection("station_stats")
        .doc(imei)
        .set({
          id: imei,
          stationCode: imei,
          imei,
          name: meta.name || "",
          location: meta.location || "",
          iccid: meta.iccid || "",
          station_status,
          totalSlots: 0,
          availableCount: 0,
          rentedCount: 0,
          overdueCount: 0,
          timestamp: now,
          batteries: [],
          message: "❌ Station offline",
        });
      return { success: true, station: imei, status: "offline" };
    }

    // 4. Prepare lookup of present batteries
    const presentIds = new Set(
      rawBatteries
        .map((b: any) => normalizeBatteryId(b.battery_id))
        .filter(Boolean),
    );

    // 5. Build initial slot map with empty entries
    const slotMap = new Map<string, any>();
    for (let slot = 1; slot <= MACHINE_CAPACITY; slot++) {
      const id = String(slot);
      slotMap.set(id, {
        slot_id: id,
        battery_id: null,
        level: null,
        status: "Empty",
        rented: false,
        phoneNumber: "",
        rentedAt: null,
        amount: 0,
      });
    }

    // 6. Overlay HeyCharge data (live batteries)
    rawBatteries.forEach((b: any) => {
      if (!b.slot_id || typeof b.slot_id !== "string") return;
      const batteryLevel = parseInt(b.battery_capacity) || null;
      const isOnline = b.lock_status === "1";
      const slotHealthy = isHealthyHeyChargeState(b.slot_status);
      const batteryHealthyStatus = isHealthyHeyChargeState(b.battery_status);
      const isHealthy =
        b.battery_abnormal === "0" &&
        b.cable_abnormal === "0" &&
        slotHealthy &&
        batteryHealthyStatus;
      const isLowBattery =
        isOnline &&
        isHealthy &&
        batteryLevel !== null &&
        batteryLevel < MIN_RENTABLE_BATTERY_PERCENT;
      const status = !isOnline
        ? "Offline"
        : !isHealthy
          ? "Problem Slot"
          : isLowBattery
            ? "Low Battery"
            : "Online";

      slotMap.set(b.slot_id, {
        slot_id: b.slot_id,
        battery_id: normalizeBatteryId(b.battery_id) || b.battery_id,
        level: batteryLevel,
        status,
        rented: false,
        phoneNumber: "",
        rentedAt: null,
        amount: 0,
      });
    });

    // 6b. Auto-resolve problem slots if battery in that slot is now healthy
    const healthySlotIds = new Set(
      rawBatteries
        .filter(
          (b: any) =>
            b.slot_id &&
            b.lock_status === "1" &&
            b.battery_abnormal === "0" &&
            b.cable_abnormal === "0" &&
            isHealthyHeyChargeState(b.slot_status) &&
            isHealthyHeyChargeState(b.battery_status),
        )
        .map((b: any) => b.slot_id),
    );

    const problemSlotsSnap = await db
      .collection("problem_slots")
      .where("imei", "==", imei)
      .where("resolved", "==", false)
      .get();

    for (const psDoc of problemSlotsSnap.docs) {
      const slotId = psDoc.data().slot_id;
      if (healthySlotIds.has(slotId)) {
        await psDoc.ref.update({
          resolved: true,
          resolvedAt: now.toDate(),
          resolvedBy: "cron-auto",
        });
        console.error(
          `✅ Auto-resolved problem slot ${slotId} on station ${imei} — battery healthy`,
        );
      }
    }

    // 7. Fetch all active rentals once, then auto-return any whose battery is
    // physically present in a station using normalized battery IDs.
    const rentalsSnap = await db
      .collection(RENTALS_COLLECTION)
      .where("status", "==", "rented")
      .get();

    let rentedCount = 0;
    let overdueCount = 0;
    const nowDate = now.toDate();

    const allActiveRentals: ActiveRentalRow[] = rentalsSnap.docs.map(
      (rentalDoc) => ({
        doc: rentalDoc,
        id: rentalDoc.id,
        ...(rentalDoc.data() as Record<string, any>),
      }),
    );

    const autoReturnedRentalIds = new Set<string>();
    const returnedBatteryIds = new Set<string>();

    for (const rental of allActiveRentals) {
      const normalizedBatteryId = normalizeBatteryId(rental.battery_id);
      if (
        !normalizedBatteryId ||
        !presentIds.has(normalizedBatteryId) ||
        returnedBatteryIds.has(normalizedBatteryId)
      ) {
        continue;
      }

      const matchingRentals = allActiveRentals.filter(
        (row) => normalizeBatteryId(row.battery_id) === normalizedBatteryId,
      );
      const returnNote =
        rental.imei === imei
          ? "Auto-returned: battery physically present"
          : `Auto-returned: battery physically present at station ${imei}`;

      for (const matchingRental of matchingRentals) {
        await matchingRental.doc.ref.update({
          status: "returned",
          returnedAt: now,
          note: returnNote,
        });
        autoReturnedRentalIds.add(matchingRental.id);
      }

      await clearBatteryStateIfCurrent({
        batteryId: normalizedBatteryId,
        rentalId: rental.id,
        note: returnNote,
        force: true,
      });
      returnedBatteryIds.add(normalizedBatteryId);

      console.error(
        rental.imei === imei
          ? `↩️ Auto-returned ${normalizedBatteryId}`
          : `↩️ Auto-returned ${normalizedBatteryId} from rental station ${rental.imei} because it is present at station ${imei}`,
      );
    }

    const openActiveRentals = allActiveRentals.filter(
      (rental) => !autoReturnedRentalIds.has(rental.id),
    );

    const officialActiveRentals =
      await synchronizeBatteryStateFromActiveRentals(openActiveRentals);
    const validRentals = officialActiveRentals.filter((rental) => rental.imei === imei);

    // 11. Assign each valid rental to first available virtual slot
    for (const r of validRentals) {
      const { amount, timestamp } = r;
      const trustedPhoneNumber = getTrustedRentalPhone(r);

      let assignedSlot: string | null = null;
      for (let slot = 1; slot <= MACHINE_CAPACITY; slot++) {
        const slotId = String(slot);
        const slotData = slotMap.get(slotId);
        if (
          slotData.status === "Empty" &&
          !slotData.rented &&
          !slotData.battery_id
        ) {
          assignedSlot = slotId;
          break;
        }
      }

      if (!assignedSlot) continue;
      if (!timestamp || !amount) continue;

      const diffMs = nowDate.getTime() - timestamp.toDate().getTime();
      const diffH = diffMs / 3600000;
      let isOverdue = false;
      if (diffH > 5) isOverdue = true;

      slotMap.set(assignedSlot, {
        slot_id: assignedSlot,
        battery_id: normalizeBatteryId(r.battery_id) || r.battery_id,
        level: null,
        status: isOverdue ? "Overdue" : "Rented",
        rented: true,
        phoneNumber: trustedPhoneNumber || "",
        rentedAt: timestamp,
        amount: amount || 0,
      });

      rentedCount++;
      if (isOverdue) overdueCount++;
    }

    // 12. Finalize slots and counts
    const slots = Array.from(slotMap.values()).sort(
      (a, b) => parseInt(a.slot_id) - parseInt(b.slot_id),
    );
    const totalSlots = slots.length;
    const availableCount = slots.filter((s) => s.status === "Online").length;

    // 13. Write consolidated stats
    await db
      .collection("station_stats")
      .doc(imei)
      .set({
        id: imei,
        stationCode: imei,
        imei,
        name: meta.name || "",
        location: meta.location || "",
        iccid: meta.iccid || "",
        station_status,
        totalSlots,
        availableCount,
        rentedCount,
        overdueCount,
        timestamp: now,
        batteries: slots,
      });

    cacheComponent.invalidatePrefix("stations:stats:");
    cacheComponent.invalidatePrefix("revenue:");
    cacheComponent.invalidatePrefix("customers:");
    cacheComponent.invalidatePrefix("charts:");
    cacheComponent.invalidate("transactions:latest");
    cacheComponent.invalidatePrefix("dashboard:summary:");

    return {
      success: true,
      station: imei,
      totalSlots,
      availableCount,
      rentedCount,
      overdueCount,
    };
  } catch (err: any) {
    try {
      const errMeta = stationCache[imei] || {};
      await db
        .collection("station_stats")
        .doc(imei)
        .set({
          id: imei,
          stationCode: imei,
          imei,
          name: errMeta.name || "",
          location: errMeta.location || "",
          iccid: errMeta.iccid || "",
          station_status: "Offline",
          totalSlots: 0,
          availableCount: 0,
          rentedCount: 0,
          overdueCount: 0,
          timestamp: admin.firestore.Timestamp.now(),
          batteries: [],
          message: `❌ Error: ${err.message}`,
          lastError: err.message,
          lastErrorTime: admin.firestore.Timestamp.now(),
        });
    } catch (dbErr: any) {
      console.error(
        `❌ Failed to write error state for ${imei}:`,
        dbErr.message,
      );
    }

    return { success: false, station: imei, error: err.message };
  }
}

// Bulk update all stations
export async function updateStationStats() {
  let successCount = 0;
  let failureCount = 0;
  const stationResults: { imei: string; status: string; detail: string }[] = [];

  for (const imei of ALL_STATIONS) {
    const result = await updateSingleStation(imei);
    if (result.success) {
      successCount++;
      const r = result as any;
      if (r.status === "offline") {
        stationResults.push({
          imei,
          status: "⚠️ OFFLINE",
          detail: "Station offline",
        });
      } else {
        stationResults.push({
          imei,
          status: "✅ UPDATED",
          detail: `slots=${r.totalSlots} avail=${r.availableCount} rented=${r.rentedCount} overdue=${r.overdueCount}`,
        });
      }
    } else {
      failureCount++;
      stationResults.push({
        imei,
        status: "❌ FAILED",
        detail: (result as any).error || "Unknown error",
      });
    }
  }

  // Log each station result separately so Vercel captures each line
  for (const r of stationResults) {
    console.error(`📊 ${r.imei}: ${r.status} — ${r.detail}`);
  }
  console.error(
    `📊 Station stats update complete: ${successCount} OK, ${failureCount} FAILED out of ${ALL_STATIONS.length}`,
  );

  return {
    success: true,
    successCount,
    failureCount,
    total: ALL_STATIONS.length,
    stations: stationResults,
  };
}
