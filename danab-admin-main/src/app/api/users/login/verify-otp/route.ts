import { NextRequest, NextResponse } from "next/server";

import { signToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/authCookie";
import { verifyLoginChallenge } from "@/lib/loginOtp";

export async function POST(req: NextRequest) {
  try {
    const { challengeId, otp } = await req.json();

    if (
      typeof challengeId !== "string" ||
      !challengeId.trim() ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp.trim())
    ) {
      return NextResponse.json(
        { error: "Challenge and 6-digit OTP are required ❌" },
        { status: 400 },
      );
    }

    const result = await verifyLoginChallenge(challengeId.trim(), otp.trim());
    if (!result.ok) {
      const message =
        result.reason === "expired"
          ? "OTP expired. Please login again ❌"
          : result.reason === "locked"
            ? "Too many invalid OTP attempts. Please login again ❌"
            : "Invalid OTP ❌";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const token = signToken({
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
    });

    const expiresAt = Date.now() + 1 * 60 * 60 * 1000;

    const response = NextResponse.json({
      message: "Login successful ✅",
      token,
      expiresAt,
      user: result.user,
    });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });
    return response;
  } catch (error: any) {
    if (typeof error?.message === "string" && error.message.includes("JWT_SECRET")) {
      return NextResponse.json(
        { error: "JWT_SECRET is missing or too short in Vercel ❌" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "OTP verification failed" }, { status: 500 });
  }
}
