import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import db from "@/lib/firebase-admin";

const LOGIN_CHALLENGES_COLLECTION = "admin_login_challenges";
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

export type LoginChallengeUser = {
  id: string;
  username: string;
  role: string;
  email: string;
};

function hashOtp(challengeId: string, otpCode: string): string {
  return crypto
    .createHash("sha256")
    .update(`${challengeId}:${otpCode}`)
    .digest("hex");
}

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function getOtpExpiryMinutes(): number {
  return OTP_EXPIRY_MINUTES;
}

export function getOtpResendCooldownSeconds(): number {
  return OTP_RESEND_COOLDOWN_SECONDS;
}

export async function createLoginChallenge(user: LoginChallengeUser) {
  const challengeId = user.id;
  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const resendAvailableAt = new Date(
    Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
  );

  await db.collection(LOGIN_CHALLENGES_COLLECTION).doc(challengeId).set({
    userId: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    otpHash: hashOtp(challengeId, otpCode),
    attempts: 0,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(expiresAt),
    resendAvailableAt: Timestamp.fromDate(resendAvailableAt),
    updatedAt: Timestamp.now(),
  });

  return {
    challengeId,
    otpCode,
    expiresAt: expiresAt.getTime(),
    resendAvailableAt: resendAvailableAt.getTime(),
  };
}

export async function resendLoginChallenge(
  challengeId: string,
): Promise<
  | {
      ok: true;
      challengeId: string;
      otpCode: string;
      expiresAt: number;
      resendAvailableAt: number;
      user: LoginChallengeUser;
    }
  | { ok: false; reason: "missing" | "expired" | "cooldown" }
> {
  const docRef = db.collection(LOGIN_CHALLENGES_COLLECTION).doc(challengeId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { ok: false, reason: "missing" };
  }

  const data = doc.data() as Record<string, any>;
  const expiresAt = data.expiresAt?.toDate?.() as Date | undefined;
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    await docRef.delete();
    return { ok: false, reason: "expired" };
  }

  const resendAvailableAt = data.resendAvailableAt?.toDate?.() as Date | undefined;
  if (resendAvailableAt && resendAvailableAt.getTime() > Date.now()) {
    return { ok: false, reason: "cooldown" };
  }

  const user: LoginChallengeUser = {
    id: String(data.userId || ""),
    username: String(data.username || ""),
    role: String(data.role || ""),
    email: String(data.email || ""),
  };

  const refreshed = await createLoginChallenge(user);

  return {
    ok: true,
    challengeId: refreshed.challengeId,
    otpCode: refreshed.otpCode,
    expiresAt: refreshed.expiresAt,
    resendAvailableAt: refreshed.resendAvailableAt,
    user,
  };
}

export async function verifyLoginChallenge(
  challengeId: string,
  otpCode: string,
): Promise<
  | { ok: true; user: LoginChallengeUser }
  | { ok: false; reason: "invalid" | "expired" | "missing" | "locked" }
> {
  const docRef = db.collection(LOGIN_CHALLENGES_COLLECTION).doc(challengeId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { ok: false, reason: "missing" };
  }

  const data = doc.data() as Record<string, any>;
  const expiresAt = data.expiresAt?.toDate?.() as Date | undefined;
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    await docRef.delete();
    return { ok: false, reason: "expired" };
  }

  const attempts = Number(data.attempts || 0);
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await docRef.delete();
    return { ok: false, reason: "locked" };
  }

  const expectedHash = data.otpHash;
  if (expectedHash !== hashOtp(challengeId, otpCode)) {
    await docRef.update({
      attempts: attempts + 1,
      updatedAt: Timestamp.now(),
    });
    return { ok: false, reason: "invalid" };
  }

  await docRef.delete();
  return {
    ok: true,
    user: {
      id: String(data.userId || ""),
      username: String(data.username || ""),
      role: String(data.role || ""),
      email: String(data.email || ""),
    },
  };
}
