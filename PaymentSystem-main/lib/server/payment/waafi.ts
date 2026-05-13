import { getRequiredEnv } from "@/lib/server/env";

import { parseResponseBody, toErrorMessage } from "@/lib/server/payment/http";
import { WaafiResponse } from "@/lib/server/payment/types";

// Waafi MWALLET_ACCOUNT pushes a USSD prompt to the customer's phone and
// waits for them to enter their PIN. In real-world usage this can easily
// take 30–60 seconds. A short timeout caused frequent false "Waafi request
// timed out" errors and, on rapid retries, indirect "No available battery"
// failures because reservations TTL out at 2 minutes.
const WAAFI_REQUEST_TIMEOUT_MS = 90_000;

type WaafiServiceName = "API_PURCHASE" | "API_REVERSAL";

function normalizePhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("252") && digits.length > 9) {
    return digits.slice(-9);
  }

  return digits;
}

function toWaafiAccountNumber(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");

  if (digits.startsWith("252")) {
    return digits;
  }

  return `252${digits}`;
}

async function requestWaafiAction({
  serviceName,
  serviceParams,
}: {
  serviceName: WaafiServiceName;
  serviceParams: Record<string, unknown>;
}) {
  const payload = {
    schemaVersion: "1.0",
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    channelName: "WEB",
    serviceName,
    serviceParams: {
      merchantUid: getRequiredEnv("WAAFI_MERCHANT_UID"),
      apiUserId: getRequiredEnv("WAAFI_API_USER_ID"),
      apiKey: getRequiredEnv("WAAFI_API_KEY"),
      ...serviceParams,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, WAAFI_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(getRequiredEnv("WAAFI_URL"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Waafi request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responsePayload = (await parseResponseBody(response)) as WaafiResponse | string | null;

  if (!response.ok) {
    throw new Error(toErrorMessage(responsePayload, "Waafi request failed"));
  }

  return (responsePayload || {}) as WaafiResponse;
}

export async function requestWaafiPurchase({
  phoneNumber,
  amount,
  referenceId,
}: {
  phoneNumber: string;
  amount: number;
  referenceId: string;
}) {
  return requestWaafiAction({
    serviceName: "API_PURCHASE",
    serviceParams: {
      paymentMethod: "MWALLET_ACCOUNT",
      payerInfo: { accountNo: toWaafiAccountNumber(phoneNumber) },
      transactionInfo: {
        referenceId,
        invoiceId: referenceId,
        amount: amount.toFixed(2),
        currency: "USD",
        description: "Powerbank rental payment",
      },
    },
  });
}

export async function reverseWaafiPurchase({
  transactionId,
  description,
}: {
  transactionId: string;
  description?: string;
}) {
  return requestWaafiAction({
    serviceName: "API_REVERSAL",
    serviceParams: {
      transactionId,
      description: description || "Powerbank rental payment reversed",
    },
  });
}

export function isWaafiApproved(waafiResponse: WaafiResponse) {
  const responseCodeApproved =
    waafiResponse.responseCode === "2001" || waafiResponse.responseCode === 2001;
  const stateApproved =
    String(waafiResponse.params?.state || "").trim().toUpperCase() === "APPROVED";

  return responseCodeApproved && stateApproved;
}

export function extractWaafiIds(waafiResponse: WaafiResponse) {
  return {
    transactionId: waafiResponse.params?.transactionId || null,
    issuerTransactionId: waafiResponse.params?.issuerTransactionId || null,
    referenceId: waafiResponse.params?.referenceId || null,
  };
}

export function extractWaafiAudit(waafiResponse: WaafiResponse) {
  const rawAccountNo = String(waafiResponse.params?.accountNo || "");
  const waafiConfirmedPhoneNumber =
    rawAccountNo && !rawAccountNo.includes("*")
      ? normalizePhoneDigits(rawAccountNo) || null
      : null;

  return {
    waafiResponseCode:
      waafiResponse.responseCode !== undefined && waafiResponse.responseCode !== null
        ? String(waafiResponse.responseCode)
        : null,
    waafiErrorCode: waafiResponse.errorCode || null,
    waafiResponseMsg: waafiResponse.responseMsg || null,
    waafiResponseId: waafiResponse.responseId || null,
    waafiResponseTimestamp: waafiResponse.timestamp || null,
    waafiState: waafiResponse.params?.state || null,
    waafiAccountNo: waafiResponse.params?.accountNo || null,
    waafiConfirmedPhoneNumber,
    waafiAccountType: waafiResponse.params?.accountType || null,
    waafiMerchantCharges: waafiResponse.params?.merchantCharges || null,
    waafiTxAmount: waafiResponse.params?.txAmount || null,
  };
}

export function mergeWaafiAuditRecords(
  ...audits: Array<Record<string, unknown> | undefined>
) {
  const merged: Record<string, unknown> = {};

  for (const audit of audits) {
    if (!audit) {
      continue;
    }

    for (const [key, value] of Object.entries(audit)) {
      if (value !== undefined && value !== null && value !== "") {
        merged[key] = value;
      }
    }
  }

  return merged;
}
