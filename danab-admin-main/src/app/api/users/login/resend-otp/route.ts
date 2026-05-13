import { NextRequest, NextResponse } from "next/server";

import {
  getOtpExpiryMinutes,
  getOtpResendCooldownSeconds,
  resendLoginChallenge,
} from "@/lib/loginOtp";
import { maskEmail, sendAdminOtpEmail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  try {
    const { challengeId } = await req.json();

    if (typeof challengeId !== "string" || !challengeId.trim()) {
      return NextResponse.json(
        { error: "Challenge is required ❌" },
        { status: 400 },
      );
    }

    const result = await resendLoginChallenge(challengeId.trim());
    if (!result.ok) {
      if (result.reason === "cooldown") {
        return NextResponse.json(
          {
            error: `Please wait ${getOtpResendCooldownSeconds()} seconds before resending OTP ❌`,
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: "OTP expired. Please login again ❌" },
        { status: 410 },
      );
    }

    await sendAdminOtpEmail({
      to: result.user.email,
      username: result.user.username,
      otpCode: result.otpCode,
      expiresMinutes: getOtpExpiryMinutes(),
    });

    return NextResponse.json({
      message: "OTP resent ✅",
      challengeId: result.challengeId,
      otpExpiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
      email: maskEmail(result.user.email),
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "";
    if (
      message.includes("SMTP_USER") ||
      message.includes("SMTP_PASS") ||
      message.includes("SMTP_FROM")
    ) {
      return NextResponse.json(
        { error: "SMTP email settings are missing in Vercel ❌" },
        { status: 503 },
      );
    }
    if (
      message.toLowerCase().includes("invalid login") ||
      message.toLowerCase().includes("authentication unsuccessful")
    ) {
      return NextResponse.json(
        { error: "SMTP email login failed. Check Gmail app password ❌" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to resend OTP ❌" },
      { status: 500 },
    );
  }
}
