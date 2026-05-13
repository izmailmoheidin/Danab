import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

import db from "@/lib/firebase-admin";
import type { TokenPayload } from "@/lib/auth";

const AUDIT_LOGS_COLLECTION = "audit_logs";

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditValue);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (/password|token|secret|authorization/i.test(key)) {
        result[key] = "[redacted]";
        continue;
      }
      result[key] = sanitizeAuditValue(nestedValue);
    }
    return result;
  }

  return value;
}

function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.headers.get("x-real-ip");
}

export async function writeAuditLog({
  req,
  actor,
  action,
  targetType,
  targetId,
  targetLabel,
  before,
  after,
}: {
  req: NextRequest;
  actor: TokenPayload;
  action: string;
  targetType: "user" | "station";
  targetId: string;
  targetLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  await db.collection(AUDIT_LOGS_COLLECTION).add({
    action,
    targetType,
    targetId,
    targetLabel: targetLabel || null,
    actor: {
      id: actor.id,
      username: actor.username,
      role: actor.role,
    },
    before: before ? sanitizeAuditValue(before) : null,
    after: after ? sanitizeAuditValue(after) : null,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") || null,
    createdAt: Timestamp.now(),
  });
}
