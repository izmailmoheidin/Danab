import {
  acquirePhonePaymentLock,
  releaseReservation,
  releasePhonePaymentLock,
  reserveBattery,
} from "@/lib/server/payment/battery-lock";
import { BatteryStateConflictError } from "@/lib/server/payment/battery-state";
import { normalizeBatteryId } from "@/lib/server/payment/battery-id";
import { HttpError } from "@/lib/server/payment/errors";
import {
  getAvailableBattery,
  isSpecificBatteryReadyForRental,
  markProblemSlot,
  MIN_AVAILABLE_BATTERY_PERCENT,
  queryStationBatteries,
  releaseBattery,
} from "@/lib/server/payment/heycharge";
import { isPhoneBlacklisted } from "@/lib/server/payment/blacklist";
import {
  createRentalLog,
  isDuplicateTransaction,
  updateRentalUnlockStatus,
} from "@/lib/server/payment/rentals";
import { getActiveStationCode, getStationImei } from "@/lib/server/payment/station";
import { resolveStationConfigByCode } from "@/lib/server/station-config";
import { notifyPaidButNotEjected } from "@/lib/server/payment/telegram";
import { PaymentInput, PaymentPayload } from "@/lib/server/payment/types";
import {
  extractWaafiAudit,
  extractWaafiIds,
  isWaafiApproved,
  requestWaafiPurchase,
  reverseWaafiPurchase,
} from "@/lib/server/payment/waafi";

const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_RETRY_DELAY_MS = 5_000;
// After HeyCharge returns a successful unlock response, batteries typically
// take a couple of seconds to mechanically eject. We wait this long, then
// re-query the station to confirm the battery actually left the slot.
const POST_UNLOCK_VERIFY_DELAY_MS = 3_000;

type BatteryPresence = "present" | "missing" | "unknown";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkBatteryPresence(
  imei: string,
  batteryId: string,
  slotId: string,
): Promise<BatteryPresence> {
  try {
    const stationBatteries = await queryStationBatteries(imei);
    const stillThere = stationBatteries.some(
      (battery) =>
        normalizeBatteryId(battery.battery_id) === normalizeBatteryId(batteryId) &&
        battery.slot_id === slotId,
    );

    return stillThere ? "present" : "missing";
  } catch (error) {
    console.warn(
      "Failed to recheck slot status after unlock attempt:",
      error instanceof Error ? error.message : error,
    );
    return "unknown";
  }
}

export async function processPayment(
  input: PaymentInput,
): Promise<PaymentPayload> {
  const phoneNumber = input.phoneNumber.replace(/\D/g, "");
  const { amount } = input;
  const requestedStationCode = String(input.stationCode || "").replace(/\D/g, "");

  const blacklisted = await isPhoneBlacklisted(phoneNumber);
  if (blacklisted) {
    throw new HttpError(
      403,
      "You are blocked from renting. Please contact support.",
    );
  }

  const requestedStationConfig = requestedStationCode
    ? await resolveStationConfigByCode(requestedStationCode)
    : null;
  if (requestedStationCode && !requestedStationConfig) {
    throw new HttpError(400, "Invalid station code");
  }

  const imei = requestedStationConfig?.imei || (await getStationImei());
  const stationCode =
    requestedStationConfig?.code || (await getActiveStationCode());
  const phoneLockAcquired = await acquirePhonePaymentLock(phoneNumber);
  if (!phoneLockAcquired) {
    throw new HttpError(
      409,
      "A payment for this phone is already being processed. Please wait a moment before trying again.",
    );
  }

  let reservedBatteryId: string | null = null;

  try {
    // NOTE: We intentionally allow the same phone number to hold multiple
    // active rentals concurrently. Customers can rent as many power banks
    // as they want — useful for groups or family members sharing a phone.
    // Battery uniqueness is still enforced at the battery level (a single
    // battery can never be rented to two people at the same time) via the
    // BatteryStateConflictError check in createRentalLog.

    // ── Atomic battery reservation ────────────────────────────────
    // Try up to 3 different batteries in case another user reserves
    // the first one between our query and our reservation attempt.
    const MAX_RESERVE_ATTEMPTS = 3;
    let battery = null;

    for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
      let candidate;
      try {
        candidate = await getAvailableBattery(imei);
      } catch (err) {
        // Station unreachable / HeyCharge connectivity failure (timeout,
        // HTTP 402 subscription, network error, etc.). Translate to a
        // user-friendly 503 instead of letting it bubble up as a generic
        // 500. No money has been charged at this point.
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
          `Station ${imei} unreachable while looking for available battery: ${reason}`,
        );
        throw new HttpError(
          503,
          "This station is currently offline. Please try another station.",
          { imei, reason },
        );
      }
      if (!candidate) break;

      const reserved = await reserveBattery(
        imei,
        candidate.battery_id,
        phoneNumber,
      );
      if (reserved) {
        const stillReady = await isSpecificBatteryReadyForRental({
          imei,
          batteryId: candidate.battery_id,
          slotId: candidate.slot_id,
        });

        if (!stillReady) {
          console.warn(
            `Reserve attempt ${attempt + 1}: battery ${candidate.battery_id} is no longer ready before payment, trying next`,
          );
          await releaseReservation(imei, candidate.battery_id);
          continue;
        }

        battery = candidate;
        reservedBatteryId = candidate.battery_id;
        break;
      }
      console.warn(
        `Reserve attempt ${attempt + 1}: battery ${candidate.battery_id} already taken, trying next`,
      );
    }

    if (!battery) {
      throw new HttpError(
        400,
        `No available battery ≥ ${MIN_AVAILABLE_BATTERY_PERCENT}%`,
      );
    }

    // Charge first with Waafi purchase, then release the reserved battery.
    const purchaseReferenceId = `ref-${Date.now()}`;
    const purchaseResponse = await requestWaafiPurchase({
      phoneNumber,
      amount,
      referenceId: purchaseReferenceId,
    });

    if (!isWaafiApproved(purchaseResponse)) {
      throw new HttpError(400, "Payment not approved", {
        waafiResponse: purchaseResponse,
        waafiMsg: purchaseResponse.responseMsg || "",
      });
    }

    const { transactionId, issuerTransactionId, referenceId } =
      extractWaafiIds(purchaseResponse);
    const waafiAudit = extractWaafiAudit(purchaseResponse);
    const waafiConfirmedPhoneNumber =
      typeof waafiAudit.waafiConfirmedPhoneNumber === "string" &&
      waafiAudit.waafiConfirmedPhoneNumber.trim().length > 0
        ? waafiAudit.waafiConfirmedPhoneNumber.trim()
        : null;
    // Keep the approved requested phone immutable for operations/calling.
    // Waafi account data stays in dedicated audit fields because it
    // may return a masked account string that is not safe to treat as the
    // main customer phone number.
    const canonicalPhoneNumber = phoneNumber;
    const phoneAuthority = waafiConfirmedPhoneNumber
      ? waafiConfirmedPhoneNumber === phoneNumber
        ? "waafi_confirmed_full_match"
        : "requested_phone_waafi_mismatch"
      : "requested_phone_only";

    if (!transactionId) {
      throw new HttpError(
        502,
        "Payment was approved, but Waafi did not return a transaction ID. Please try again.",
      );
    }

    if (transactionId) {
      const duplicate = await isDuplicateTransaction(transactionId);
      if (duplicate) {
        return {
          success: true,
          message: "Payment already processed",
          transactionId,
        };
      }
    }

    let unlock: unknown = null;
    let unlockAttempts = 0;
    let lastUnlockError: unknown = null;
    const currentBattery = battery;
    let lastKnownPresence: BatteryPresence = "unknown";

    for (let attempt = 1; attempt <= MAX_UNLOCK_ATTEMPTS; attempt++) {
      unlockAttempts = attempt;

      try {
        unlock = await releaseBattery({
          imei,
          batteryId: currentBattery.battery_id,
          slotId: currentBattery.slot_id,
        });
        lastUnlockError = null;

        // ─── Post-unlock physical verification ─────────────────────
        // HeyCharge returning HTTP 200 only means the command was accepted.
        // The battery may still be physically stuck in the slot. Wait for
        // the eject to complete, then re-query. If the same battery is still
        // present in the same slot, treat this attempt as a failed unlock
        // and continue retrying. This prevents the silent-failure mode
        // where a customer gets charged but never receives a battery.
        await delay(POST_UNLOCK_VERIFY_DELAY_MS);
        lastKnownPresence = await checkBatteryPresence(
          imei,
          currentBattery.battery_id,
          currentBattery.slot_id,
        );
        if (lastKnownPresence === "present") {
          console.warn(
            `Unlock attempt ${attempt}/${MAX_UNLOCK_ATTEMPTS}: HeyCharge returned success but battery ${currentBattery.battery_id} is still in slot ${currentBattery.slot_id} — treating as failed eject`,
          );
          lastUnlockError = new Error(
            "Battery did not physically eject after unlock command",
          );
          unlock = null;
          if (attempt < MAX_UNLOCK_ATTEMPTS) {
            await delay(UNLOCK_RETRY_DELAY_MS);
          }
          continue;
        }
        // "missing" or "unknown" → trust the HeyCharge success response.
        // (We prefer false-success-treated-as-success over false-failure-
        // treated-as-failure here, because most stations have batteries
        // ejected within 3s and a transient query error shouldn't reverse
        // a real successful rental.)
        break;
      } catch (unlockError) {
        lastUnlockError = unlockError;
        console.error(
          `Battery unlock failed on attempt ${attempt}/${MAX_UNLOCK_ATTEMPTS} for battery=${currentBattery.battery_id} phone=${phoneNumber} txn=${transactionId}:`,
          unlockError instanceof Error ? unlockError.message : unlockError,
        );

        lastKnownPresence = await checkBatteryPresence(
          imei,
          currentBattery.battery_id,
          currentBattery.slot_id,
        );

        if (lastKnownPresence === "missing") {
          console.error(
            `Battery ${currentBattery.battery_id} is no longer in slot ${currentBattery.slot_id} after unlock error — treating as successful eject`,
          );
          lastUnlockError = null;
          unlock = null;
          break;
        }

        if (attempt < MAX_UNLOCK_ATTEMPTS) {
          console.warn(
            `Battery ${currentBattery.battery_id} still not confirmed ejected after attempt ${attempt}; retrying in ${UNLOCK_RETRY_DELAY_MS}ms`,
          );
          await delay(UNLOCK_RETRY_DELAY_MS);
        }
      }
    }

    if (lastUnlockError) {
      if (lastKnownPresence !== "present") {
        lastKnownPresence = await checkBatteryPresence(
          imei,
          currentBattery.battery_id,
          currentBattery.slot_id,
        );
      }

      if (lastKnownPresence === "missing") {
        console.error(
          `Battery ${currentBattery.battery_id} not in slot ${currentBattery.slot_id} after unlock error — likely ejected successfully`,
        );
        lastUnlockError = null;
        unlock = null;
      }

      if (lastUnlockError) {
        const failureNote =
          lastKnownPresence === "present"
            ? `Unlock failed after ${unlockAttempts} attempts, battery still present`
            : `Unlock failed after ${unlockAttempts} attempts, slot status could not be rechecked`;

        if (lastKnownPresence === "present") {
          try {
            await markProblemSlot(
              imei,
              currentBattery.slot_id,
              currentBattery.battery_id,
              failureNote,
            );
          } catch (recoveryError) {
            console.error(
              "Failed to mark problem slot after purchase reversal path:",
              recoveryError instanceof Error
                ? recoveryError.message
                : recoveryError,
            );
          }
        }

        let reversalError: unknown = null;

        try {
          const reversalResponse = await reverseWaafiPurchase({
            transactionId,
            description: "Battery release failed, payment reversed",
          });

          if (!isWaafiApproved(reversalResponse)) {
            reversalError = new Error(
              reversalResponse.responseMsg || "Waafi reversal was not approved",
            );
          }
        } catch (error) {
          reversalError = error;
        }

        if (reversalError) {
          await notifyPaidButNotEjected({
            phoneNumber,
            amount,
            imei,
            stationCode,
            batteryId: currentBattery.battery_id,
            slotId: currentBattery.slot_id,
            transactionId,
            issuerTransactionId,
            referenceId,
            unlockAttempts,
            reason: `Battery release failed after payment charge, and Waafi reversal failed: ${reversalError instanceof Error ? reversalError.message : String(reversalError)}`,
          });

          throw new HttpError(
            502,
            "Battery could not be released after payment was charged. Please contact support.",
            {
              transactionId,
              batteryId: currentBattery.battery_id,
              slotId: currentBattery.slot_id,
              unlockAttempts,
            },
          );
        }

        throw new HttpError(
          502,
          "Battery could not be released. Payment was reversed.",
          {
            transactionId,
            batteryId: currentBattery.battery_id,
            slotId: currentBattery.slot_id,
            unlockAttempts,
            waafiMsg: "Payment reversed after eject failure",
          },
        );
      }
    }

    let rentalRef;
    try {
      rentalRef = await createRentalLog({
        imei,
        stationCode,
        batteryId: currentBattery.battery_id,
        slotId: currentBattery.slot_id,
        phoneNumber: canonicalPhoneNumber,
        requestedPhoneNumber: phoneNumber,
        amount,
        transactionId,
        issuerTransactionId,
        referenceId: referenceId || purchaseReferenceId,
        phoneAuthority,
        waafiAudit,
      });
    } catch (error) {
      if (error instanceof BatteryStateConflictError) {
        await notifyPaidButNotEjected({
          phoneNumber,
          amount,
          imei,
          stationCode,
          batteryId: currentBattery.battery_id,
          slotId: currentBattery.slot_id,
          transactionId,
          issuerTransactionId,
          referenceId: referenceId || purchaseReferenceId,
          unlockAttempts,
          reason: `Payment charged but battery already linked to active rental ${error.activeRentalId || "unknown"}`,
        });

        throw new HttpError(
          409,
          "Payment was confirmed, but this battery was already linked to another active rental. Please contact support.",
          {
            batteryId: error.batteryId,
            activeRentalId: error.activeRentalId,
            transactionId,
          },
        );
      }

      throw error;
    }

    await releaseReservation(imei, currentBattery.battery_id);
    reservedBatteryId = null;
    await updateRentalUnlockStatus(rentalRef.id, "unlocked");

    return {
      success: true,
      battery_id: currentBattery.battery_id,
      slot_id: currentBattery.slot_id,
      unlock,
      waafiMessage: "Codsigaagu wuu guuleystay. Fadlan qaado power bank-gaaga.",
      waafiResponse: purchaseResponse,
    };
  } finally {
    if (reservedBatteryId) {
      await releaseReservation(imei, reservedBatteryId);
    }
    await releasePhonePaymentLock(phoneNumber);
  }
}
