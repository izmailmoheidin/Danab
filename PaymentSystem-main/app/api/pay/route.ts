import { NextRequest, NextResponse } from "next/server";

import { isHttpError, processPayment } from "@/lib/server/payment-service";

import { checkRateLimit } from "@/lib/server/rate-limit";

import { getClientIp } from "@/lib/server/request";

type PaymentRequestBody = {
  phoneNumber?: string;

  amount?: number;
  stationCode?: string;
};

function parseAndValidateBody(body: PaymentRequestBody) {
  const phoneNumber =
    typeof body.phoneNumber === "string"
      ? body.phoneNumber.replace(/\D/g, "")
      : "";

  const amount = Number(body.amount);
  const stationCode =
    typeof body.stationCode === "string"
      ? body.stationCode.replace(/\D/g, "")
      : "";

  if (!phoneNumber || Number.isNaN(amount) || amount <= 0) {
    return { error: "Missing phoneNumber or valid amount" } as const;
  }

  return {
    phoneNumber,
    amount,
    ...(stationCode ? { stationCode } : {}),
  } as const;
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  const rateLimitResult = checkRateLimit(`payment:${clientIp}`, {
    windowMs: 5 * 60_000,

    max: 10,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many payment requests, please try again later." },

      {
        status: 429,

        headers: {
          "Retry-After": String(rateLimitResult.retryAfterSeconds),
        },
      },
    );
  }

  let body: PaymentRequestBody;

  try {
    body = (await request.json()) as PaymentRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseAndValidateBody(body);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await processPayment(parsed);
    return NextResponse.json(result);
  } catch (error) {
    if (isHttpError(error)) {
      // Map each error status to a clear, user-friendly bilingual message
      const errorMessages: Record<number, { en: string; so: string }> = {
        400: {
          en: "Invalid request. Please check your phone number and amount.",
          so: "Codsigu waa khalad. Fadlan hubi lambarka iyo lacagta.",
        },
        403: {
          en: "This phone number is blocked. Please contact support.",
          so: "Lambarkan waa la joojiyay. Fadlan la xiriir support.",
        },
        409: {
          en: "A payment is already in progress. Please wait 2 minutes.",
          so: "Lacag bixin ayaa horey u socota. Fadlan sug 2 daqiiqo.",
        },
        429: {
          en: "Too many attempts. Please wait 5 minutes.",
          so: "Isku day badan. Fadlan sug 5 daqiiqo.",
        },
        502: {
          en: "Payment system error. Please contact support.",
          so: "Khalad nidaamka lacag-bixinta. Fadlan la xiriir support.",
        },
        503: {
          en: "This station is currently offline. Please try another station.",
          so: "Istaashan hadda ma shaqeyso. Fadlan isku day mid kale.",
        },
        504: {
          en: "Payment timed out. Please check your phone for USSD prompt.",
          so: "Waqtiga lacag-bixinta wuu dhamaaday. Fadlan hubi telefoonkaaga USSD.",
        },
      };

      const userMessage = errorMessages[error.status] || {
        en: error.message,
        so: error.message,
      };

      const payload = {
        error: `${userMessage.en} / ${userMessage.so}`,
        errorCode: error.status,
        ...(error.details ? (error.details as Record<string, unknown>) : {}),
      };

      return NextResponse.json(payload, { status: error.status });
    }

    const rawMessage = error instanceof Error ? error.message : "Internal server error";

    // Detect common failure patterns and give friendly messages
    const lower = rawMessage.toLowerCase();
    let friendlyMessage: string;

    if (lower.includes("timeout") || lower.includes("timed out")) {
      friendlyMessage =
        "Payment request timed out (server limit). Please wait 2 minutes then try again. / " +
        "Codsiga lacag-bixinta waqti ayuu qaaday (xaddidaan server). Fadlan sug 2 daqiiqo kadibna isku day.";
    } else if (lower.includes("waafi") && (lower.includes("401") || lower.includes("unauthorized"))) {
      friendlyMessage =
        "Payment provider authentication failed. Please contact support. / " +
        "Xaqiijinta bixiye-lacaggu waa qaldantay. Fadlan la xiriir support.";
    } else if (lower.includes("waafi") && (lower.includes("403") || lower.includes("forbidden"))) {
      friendlyMessage =
        "Payment provider access denied. Please contact support. / " +
        "Helitaanka bixiye-lacaggu waa la diiday. Fadlan la xiriir support.";
    } else if (lower.includes("no available battery")) {
      friendlyMessage =
        "No power bank is ready at this station. Please try another station. / " +
        "Ma jiro powerbank diyaar ah oo ku jira istaashan. Fadlan isku day mid kale.";
    } else if (lower.includes("hey") && lower.includes("402")) {
      friendlyMessage =
        "This station is offline. Please try another station. / " +
        "Istaashan hadda ma shaqeyso. Fadlan isku day mid kale.";
    } else if (lower.includes("missing") && lower.includes("env")) {
      friendlyMessage =
        "Server configuration error. Please contact support. / " +
        "Khalad qaabeynta server-ka. Fadlan la xiriir support.";
    } else {
      friendlyMessage =
        `Payment failed: ${rawMessage}. Please try again or contact support. / ` +
        `Lacag bixintu ma dhicin: ${rawMessage}. Fadlan mar kale isku day ama la xiriir support.`;
    }

    return NextResponse.json({ error: friendlyMessage }, { status: 500 });
  }
}
