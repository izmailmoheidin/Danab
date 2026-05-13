import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  ActiveRentalRow,
  compareRentalPriorityDesc,
  groupActiveRentalsByBattery,
} from "./activeRentals";
import { normalizeBatteryId } from "./batteryId";
import db from "./firebase-admin";
import { RENTALS_COLLECTION } from "./rentalsCollection";

export const BATTERY_STATE_COLLECTION = "battery_state";

function batteryStateDocId(batteryId: string) {
  return normalizeBatteryId(batteryId) || batteryId;
}

function buildStatePayload(
  rental: ActiveRentalRow,
  claimedAt: any,
  updatedAt: Timestamp,
) {
  return {
    battery_id: batteryStateDocId(String(rental.battery_id || "")),
    imei: rental.imei || null,
    stationCode: rental.stationCode || null,
    slot_id: rental.slot_id || null,
    activeRentalId: rental.id || null,
    phoneNumber: rental.phoneNumber || "",
    requestedPhoneNumber: rental.requestedPhoneNumber || rental.phoneNumber || "",
    phoneAuthority: rental.phoneAuthority || null,
    transactionId: rental.transactionId || null,
    issuerTransactionId: rental.issuerTransactionId || null,
    referenceId: rental.referenceId || null,
    amount: rental.amount || 0,
    status: "rented",
    claimedAt,
    updatedAt,
    waafiAccountNo: rental.waafiAccountNo || null,
    waafiConfirmedPhoneNumber: rental.waafiConfirmedPhoneNumber || null,
  };
}

function mergeCanonicalStateIntoRental(
  rental: ActiveRentalRow,
  existing: Record<string, any> | null | undefined,
): ActiveRentalRow {
  if (!existing) {
    return rental;
  }

  return {
    ...rental,
    imei: existing.imei || rental.imei || null,
    stationCode: existing.stationCode || rental.stationCode || null,
    slot_id: existing.slot_id || rental.slot_id || null,
    phoneNumber: existing.phoneNumber || rental.phoneNumber || "",
    requestedPhoneNumber:
      existing.requestedPhoneNumber ||
      rental.requestedPhoneNumber ||
      rental.phoneNumber ||
      "",
    phoneAuthority: existing.phoneAuthority || rental.phoneAuthority || null,
    transactionId: existing.transactionId || rental.transactionId || null,
    issuerTransactionId:
      existing.issuerTransactionId || rental.issuerTransactionId || null,
    referenceId: existing.referenceId || rental.referenceId || null,
    amount:
      typeof existing.amount === "number"
        ? existing.amount
        : rental.amount || 0,
    waafiAccountNo: existing.waafiAccountNo || rental.waafiAccountNo || null,
    waafiConfirmedPhoneNumber:
      existing.waafiConfirmedPhoneNumber ||
      rental.waafiConfirmedPhoneNumber ||
      null,
  };
}

function shouldReplaceState(existing: any, rental: ActiveRentalRow) {
  return String(existing?.activeRentalId || "") !== String(rental.id || "");
}

function shouldRepairOfficialRental(
  existing: Record<string, any> | null | undefined,
  rental: ActiveRentalRow,
) {
  if (!existing || String(existing.activeRentalId || "") !== String(rental.id || "")) {
    return false;
  }

  return (
    String(existing.phoneNumber || "") !== String(rental.phoneNumber || "") ||
    String(existing.requestedPhoneNumber || "") !==
      String(rental.requestedPhoneNumber || rental.phoneNumber || "") ||
    String(existing.phoneAuthority || "") !== String(rental.phoneAuthority || "") ||
    String(existing.imei || "") !== String(rental.imei || "") ||
    String(existing.stationCode || "") !== String(rental.stationCode || "") ||
    String(existing.slot_id || "") !== String(rental.slot_id || "") ||
    String(existing.transactionId || "") !== String(rental.transactionId || "") ||
    String(existing.issuerTransactionId || "") !==
      String(rental.issuerTransactionId || "") ||
    String(existing.referenceId || "") !== String(rental.referenceId || "") ||
    String(existing.waafiAccountNo || "") !== String(rental.waafiAccountNo || "") ||
    String(existing.waafiConfirmedPhoneNumber || "") !==
      String(rental.waafiConfirmedPhoneNumber || "")
  );
}

function buildCanonicalRentalRepairPatch(existing: Record<string, any>) {
  return {
    battery_id: String(existing.battery_id || ""),
    imei: existing.imei || null,
    stationCode: existing.stationCode || null,
    slot_id: existing.slot_id || null,
    phoneNumber: existing.phoneNumber || "",
    requestedPhoneNumber: existing.requestedPhoneNumber || existing.phoneNumber || "",
    phoneAuthority: existing.phoneAuthority || null,
    transactionId: existing.transactionId || null,
    issuerTransactionId: existing.issuerTransactionId || null,
    referenceId: existing.referenceId || null,
    amount: typeof existing.amount === "number" ? existing.amount : 0,
    waafiAccountNo: existing.waafiAccountNo || null,
    waafiConfirmedPhoneNumber: existing.waafiConfirmedPhoneNumber || null,
  };
}

function mergeStateWithRentalDoc(
  stateDocId: string,
  state: Record<string, any>,
  rental: Record<string, any> | null | undefined,
): ActiveRentalRow {
  const activeRentalId = String(state.activeRentalId || "");
  const rentalData = rental || {};

  return {
    id: activeRentalId || stateDocId,
    batteryStateId: stateDocId,
    ...rentalData,
    battery_id: state.battery_id || rentalData.battery_id || stateDocId,
    imei: state.imei || rentalData.imei || null,
    stationCode: state.stationCode || rentalData.stationCode || null,
    slot_id: state.slot_id || rentalData.slot_id || null,
    phoneNumber: state.phoneNumber || rentalData.phoneNumber || "",
    requestedPhoneNumber:
      state.requestedPhoneNumber ||
      rentalData.requestedPhoneNumber ||
      state.phoneNumber ||
      rentalData.phoneNumber ||
      "",
    phoneAuthority: state.phoneAuthority || rentalData.phoneAuthority || null,
    transactionId: state.transactionId || rentalData.transactionId || null,
    issuerTransactionId:
      state.issuerTransactionId || rentalData.issuerTransactionId || null,
    referenceId: state.referenceId || rentalData.referenceId || null,
    amount:
      typeof state.amount === "number"
        ? state.amount
        : typeof rentalData.amount === "number"
          ? rentalData.amount
          : 0,
    status: "rented",
    timestamp: rentalData.timestamp || state.claimedAt || state.updatedAt || null,
    claimedAt: state.claimedAt || null,
    updatedAt: state.updatedAt || null,
    waafiAccountNo: state.waafiAccountNo || rentalData.waafiAccountNo || null,
    waafiConfirmedPhoneNumber:
      state.waafiConfirmedPhoneNumber ||
      rentalData.waafiConfirmedPhoneNumber ||
      null,
    unlockStatus: rentalData.unlockStatus || null,
    unlockUpdatedAt: rentalData.unlockUpdatedAt || null,
    waafiState: rentalData.waafiState || null,
    waafiResponseCode: rentalData.waafiResponseCode || null,
    waafiErrorCode: rentalData.waafiErrorCode || null,
    waafiResponseMsg: rentalData.waafiResponseMsg || null,
    waafiResponseId: rentalData.waafiResponseId || null,
    waafiResponseTimestamp: rentalData.waafiResponseTimestamp || null,
    waafiTxAmount: rentalData.waafiTxAmount || null,
    waafiMerchantCharges: rentalData.waafiMerchantCharges || null,
  };
}

export async function loadOfficialActiveRentals(): Promise<ActiveRentalRow[]> {
  const batteryStatesSnap = await db
    .collection(BATTERY_STATE_COLLECTION)
    .where("status", "==", "rented")
    .get();

  if (batteryStatesSnap.empty) {
    return [];
  }

  const stateRows = batteryStatesSnap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, any>,
    }))
    .filter((entry) => String(entry.data.activeRentalId || "").trim().length > 0);

  const rentalDocs = await Promise.all(
    stateRows.map((entry) =>
      db
        .collection(RENTALS_COLLECTION)
        .doc(String(entry.data.activeRentalId || ""))
        .get(),
    ),
  );

  const rentalById = new Map<string, Record<string, any>>();
  for (const rentalDoc of rentalDocs) {
    if (!rentalDoc.exists) continue;
    rentalById.set(rentalDoc.id, rentalDoc.data() as Record<string, any>);
  }

  return stateRows
    .map((entry) =>
      mergeStateWithRentalDoc(
        entry.id,
        entry.data,
        rentalById.get(String(entry.data.activeRentalId || "")),
      ),
    )
    .sort(compareRentalPriorityDesc);
}

export async function synchronizeBatteryStateFromActiveRentals(
  activeRentals: ActiveRentalRow[],
) {
  const grouped = groupActiveRentalsByBattery(activeRentals);
  const groupsByBattery = new Map(grouped.map((group) => [group.batteryId, group]));
  const existingStatesSnap = await db
    .collection(BATTERY_STATE_COLLECTION)
    .where("status", "==", "rented")
    .get();
  const existingStateByBattery = new Map<
    string,
    { ref: any; data: Record<string, any> }
  >();

  for (const doc of existingStatesSnap.docs) {
    const data = doc.data() as Record<string, any>;
    existingStateByBattery.set(
      batteryStateDocId(String(data.battery_id || doc.id)),
      { ref: doc.ref, data },
    );
  }

  const batch = db.batch();
  const now = Timestamp.now();
  let hasWrites = false;
  const officialRentals: ActiveRentalRow[] = [];

  for (const [batteryId, existing] of Array.from(existingStateByBattery.entries())) {
    if (groupsByBattery.has(batteryId)) {
      continue;
    }

    batch.set(
      existing.ref,
      {
        battery_id: batteryId,
        status: "returned",
        updatedAt: now,
        lastReturnedAt: now,
        activeRentalId: FieldValue.delete(),
        imei: FieldValue.delete(),
        stationCode: FieldValue.delete(),
        slot_id: FieldValue.delete(),
        phoneNumber: FieldValue.delete(),
        requestedPhoneNumber: FieldValue.delete(),
        phoneAuthority: FieldValue.delete(),
        transactionId: FieldValue.delete(),
        issuerTransactionId: FieldValue.delete(),
        referenceId: FieldValue.delete(),
        amount: FieldValue.delete(),
        waafiAccountNo: FieldValue.delete(),
        waafiConfirmedPhoneNumber: FieldValue.delete(),
      },
      { merge: true },
    );
    hasWrites = true;
  }

  for (const group of grouped) {
    const existing = existingStateByBattery.get(group.batteryId);
    const rentalsById = new Map(
      group.rentals.map((rental) => [String(rental.id || ""), rental]),
    );
    const existingRentalId = String(existing?.data.activeRentalId || "");
    const officialRental =
      (existingRentalId && rentalsById.get(existingRentalId)) ||
      [...group.rentals].sort(compareRentalPriorityDesc)[0] ||
      group.primary;

    const canonicalRental =
      existing && existingRentalId === String(officialRental.id || "")
        ? mergeCanonicalStateIntoRental(officialRental, existing.data)
        : officialRental;

    officialRentals.push(canonicalRental);

    if (!existing || shouldReplaceState(existing.data, officialRental)) {
      const claimedAt = existing?.data.claimedAt || officialRental.timestamp || now;
      const payload = buildStatePayload(officialRental, claimedAt, now);
      const ref =
        existing?.ref ||
        db.collection(BATTERY_STATE_COLLECTION).doc(group.batteryId);
      batch.set(ref, payload, { merge: true });
      hasWrites = true;
    } else if (shouldRepairOfficialRental(existing.data, officialRental)) {
      const rentalRef = db.collection(RENTALS_COLLECTION).doc(String(officialRental.id || ""));
      batch.set(
        rentalRef,
        {
          ...buildCanonicalRentalRepairPatch(existing.data),
          canonicalSyncedAt: now,
        },
        { merge: true },
      );
      hasWrites = true;
    }
  }

  if (hasWrites) {
    await batch.commit();
  }

  return officialRentals.sort(compareRentalPriorityDesc);
}

export async function clearBatteryStateIfCurrent({
  batteryId,
  rentalId,
  note,
  force = false,
}: {
  batteryId: string;
  rentalId: string;
  note?: string;
  force?: boolean;
}) {
  const normalizedBatteryId = batteryStateDocId(batteryId);
  const stateRef = db.collection(BATTERY_STATE_COLLECTION).doc(normalizedBatteryId);
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);

    if (!snap.exists) {
      tx.set(
        stateRef,
        {
          battery_id: normalizedBatteryId,
          status: "returned",
          updatedAt: now,
          lastReturnedAt: now,
          lastReturnedRentalId: rentalId,
          ...(note ? { note } : {}),
        },
        { merge: true },
      );
      return;
    }

    const data = snap.data() || {};
    const activeRentalId = String(data.activeRentalId || "");

    if (!force && activeRentalId && activeRentalId !== rentalId) {
      return;
    }

    tx.set(
      stateRef,
      {
        battery_id: normalizedBatteryId,
        status: "returned",
        updatedAt: now,
        lastReturnedAt: now,
        lastReturnedRentalId: rentalId,
        ...(note ? { note } : {}),
        activeRentalId: FieldValue.delete(),
        imei: FieldValue.delete(),
        stationCode: FieldValue.delete(),
        slot_id: FieldValue.delete(),
        phoneNumber: FieldValue.delete(),
        requestedPhoneNumber: FieldValue.delete(),
        phoneAuthority: FieldValue.delete(),
        transactionId: FieldValue.delete(),
        issuerTransactionId: FieldValue.delete(),
        referenceId: FieldValue.delete(),
        amount: FieldValue.delete(),
        waafiAccountNo: FieldValue.delete(),
        waafiConfirmedPhoneNumber: FieldValue.delete(),
      },
      { merge: true },
    );
  });
}
