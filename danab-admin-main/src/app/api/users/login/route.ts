import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { assertJwtConfigured, signToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/authCookie";
import { normalizeUsername, normalizeUsernameLookup } from "@/lib/inputValidation";
import { createLoginChallenge, getOtpExpiryMinutes } from "@/lib/loginOtp";
import { maskEmail, sendAdminOtpEmail } from "@/lib/mail";
import { hashPassword, verifyPassword } from "@/lib/passwords";

async function queryUser(
  username: string,
  attempt = 1,
): Promise<{ userId: string; userData: any } | null> {
  try {
    const usernameLookup = normalizeUsernameLookup(username);

    const normalizedSnap = await db
      .collection("system_users")
      .where("usernameNormalized", "==", usernameLookup)
      .limit(1)
      .get();

    if (!normalizedSnap.empty) {
      const userDoc = normalizedSnap.docs[0];
      const userData = userDoc.data();

      if (userData.usernameNormalized !== usernameLookup) {
        await userDoc.ref.update({
          usernameNormalized: usernameLookup,
          updatedAt: new Date(),
        });
      }

      return { userId: userDoc.id, userData };
    }

    const exactSnap = await db
      .collection("system_users")
      .where("username", "==", username)
      .limit(1)
      .get();

    if (!exactSnap.empty) {
      const userDoc = exactSnap.docs[0];
      const userData = userDoc.data();
      await userDoc.ref.update({
        usernameNormalized: normalizeUsernameLookup(userData.username || username),
        updatedAt: new Date(),
      });
      return { userId: userDoc.id, userData };
    }

    const legacySnap = await db.collection("system_users").get();
    const legacyDoc = legacySnap.docs.find((doc) => {
      const storedUsername = String(doc.data().username || "");
      return normalizeUsernameLookup(storedUsername) === usernameLookup;
    });

    if (legacyDoc) {
      const userData = legacyDoc.data();
      await legacyDoc.ref.update({
        usernameNormalized: normalizeUsernameLookup(userData.username || username),
        updatedAt: new Date(),
      });
      return { userId: legacyDoc.id, userData };
    }
    return null;
  } catch (error: any) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      return queryUser(username, attempt + 1);
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !password) {
      return NextResponse.json(
        { error: "Username and password required ❌" },
        { status: 400 },
      );
    }

    let result: { userId: string; userData: any } | null = null;

    try {
      result = await queryUser(normalizedUsername);
    } catch (error: any) {
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 503 },
      );
    }

    if (!result) {
      return NextResponse.json(
        { error: "Invalid username or password ❌" },
        { status: 401 },
      );
    }

    const { userId, userData } = result;

    const passwordCheck = await verifyPassword(password, userData.password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: "Invalid username or password ❌" },
        { status: 401 },
      );
    }
    if (passwordCheck.needsRehash) {
      await db.collection("system_users").doc(userId).update({
        password: await hashPassword(password),
        updatedAt: new Date(),
      });
    }

    let email =
      typeof userData.email === "string" ? userData.email.trim().toLowerCase() : "";
    
    // AUTO-FIX: If the email is the old default, force it to the user's real gmail
    if (!email || email.includes("danabpower.com")) {
      email = "powerbankdanab@gmail.com";
      // Update the database so it's fixed permanently
      await db.collection("system_users").doc(userId).update({
        email: email,
        updatedAt: new Date()
      });
    }

    if (!email) {
      return NextResponse.json(
        { error: "User email is missing. Contact another admin ❌" },
        { status: 400 },
      );
    }

    assertJwtConfigured();

    // Dev-only: skip OTP entirely so local testing isn't blocked by SMTP / 2FA.
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.DEV_SKIP_OTP === "true"
    ) {
      const token = signToken({
        id: userId,
        username: userData.username,
        role: userData.role,
      });
      const expiresAt = Date.now() + 60 * 60 * 1000;
      const response = NextResponse.json({
        message: "Login successful ✅ (dev OTP bypass)",
        token,
        expiresAt,
        user: {
          id: userId,
          username: userData.username,
          role: userData.role,
          email,
        },
      });
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      });
      console.warn(
        `[login] DEV_SKIP_OTP active — issued token for ${userData.username} without OTP`,
      );
      return response;
    }

    const challenge = await createLoginChallenge({
      id: userId,
      username: userData.username,
      role: userData.role,
      email,
    });

    try {
      await sendAdminOtpEmail({
        to: email,
        username: userData.username,
        otpCode: challenge.otpCode,
        expiresMinutes: getOtpExpiryMinutes(),
      });
    } catch (mailError: any) {
      // In development, fall back to logging the OTP to the server console
      // so you can still complete login when SMTP is blocked by the network.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "\n========================================\n" +
            `⚠️  SMTP delivery failed: ${mailError?.message || mailError}\n` +
            `📨 Dev OTP for ${userData.username} (${email}): ${challenge.otpCode}\n` +
            "========================================\n",
        );
      } else {
        throw mailError;
      }
    }

    return NextResponse.json({
      message: "OTP sent ✅",
      otpRequired: true,
      challengeId: challenge.challengeId,
      otpExpiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
      email: maskEmail(email),
    });
  } catch (error: any) {
    console.error("[login] Unhandled error:", error);
    const message = typeof error?.message === "string" ? error.message : "";
    if (message.includes("JWT_SECRET")) {
      return NextResponse.json(
        { error: "JWT_SECRET is missing or too short in Vercel ❌" },
        { status: 503 },
      );
    }
    if (message.includes("SMTP_USER") || message.includes("SMTP_PASS") || message.includes("SMTP_FROM")) {
      return NextResponse.json(
        { error: "SMTP email settings are missing in Vercel ❌" },
        { status: 503 },
      );
    }
    if (message.toLowerCase().includes("invalid login") || message.toLowerCase().includes("authentication unsuccessful")) {
      return NextResponse.json(
        { error: "SMTP email login failed. Check Gmail app password ❌" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 },
    );
  }
}
