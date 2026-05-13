import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { writeAuditLog } from "@/lib/auditLog";
import { cacheComponent } from "@/lib/cacheComponent";
import {
  assertValidEmail,
  assertValidPassword,
  assertValidUsername,
  normalizeEmail,
  normalizeUsername,
  normalizeUsernameLookup,
} from "@/lib/inputValidation";
import { hashPassword } from "@/lib/passwords";

export async function PUT(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ["admin"]);
  if (roleCheck) return roleCheck;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const username = searchParams.get("username");
    const updates = await req.json();

    if (!id && !username) {
      return NextResponse.json(
        { error: "Provide 'id' or 'username' to update user ❌" },
        { status: 400 },
      );
    }

    if (
      updates.role &&
      !["admin", "moderator", "user"].includes(updates.role)
    ) {
      return NextResponse.json(
        { error: "Role must be 'admin', 'moderator', or 'user' ❌" },
        { status: 400 },
      );
    }

    let userDocRef: any;
    let currentData: any;

    if (id) {
      userDocRef = db.collection("system_users").doc(id);
      const doc = await userDocRef.get();
      if (!doc.exists) {
        return NextResponse.json(
          { error: "User not found ❌" },
          { status: 404 },
        );
      }
      currentData = doc.data();
    } else {
      const snap = await db
        .collection("system_users")
        .where("username", "==", username)
        .limit(1)
        .get();
      if (snap.empty) {
        return NextResponse.json(
          { error: "User not found ❌" },
          { status: 404 },
        );
      }
      userDocRef = snap.docs[0].ref;
      currentData = snap.docs[0].data();
    }

    const sanitizedUpdates: Record<string, unknown> = {};

    if (typeof updates.username === "string") {
      const normalizedUsername = normalizeUsername(updates.username);
      const normalizedUsernameLookup = normalizeUsernameLookup(updates.username);
      const usernameError = assertValidUsername(normalizedUsername);
      if (usernameError) {
        return NextResponse.json({ error: usernameError }, { status: 400 });
      }
      sanitizedUpdates.username = normalizedUsername;
      sanitizedUpdates.usernameNormalized = normalizedUsernameLookup;
    }

    if (typeof updates.email === "string") {
      const normalizedEmail = normalizeEmail(updates.email);
      const emailError = assertValidEmail(normalizedEmail);
      if (emailError) {
        return NextResponse.json({ error: emailError }, { status: 400 });
      }
      sanitizedUpdates.email = normalizedEmail;
    }

    if (typeof updates.role === "string") {
      sanitizedUpdates.role = updates.role;
    }

    if (Array.isArray(updates.permissions)) {
      sanitizedUpdates.permissions = updates.permissions;
    }

    if (typeof updates.password === "string" && updates.password.trim().length > 0) {
      const passwordError = assertValidPassword(updates.password);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }
      sanitizedUpdates.password = await hashPassword(updates.password);
    }

    if (
      sanitizedUpdates.username &&
      sanitizedUpdates.username !== currentData.username
    ) {
      const usernameNormalizedSnap = await db
        .collection("system_users")
        .where(
          "usernameNormalized",
          "==",
          String(sanitizedUpdates.usernameNormalized || ""),
        )
        .get();
      if (usernameNormalizedSnap.docs.some((doc) => doc.id !== userDocRef.id)) {
        return NextResponse.json(
          { error: "Username already exists ❌" },
          { status: 409 },
        );
      }

      const usernameSnap = await db
        .collection("system_users")
        .where("username", "==", sanitizedUpdates.username)
        .get();
      if (usernameSnap.docs.some((doc) => doc.id !== userDocRef.id)) {
        return NextResponse.json(
          { error: "Username already exists ❌" },
          { status: 409 },
        );
      }
    }

    if (sanitizedUpdates.email && sanitizedUpdates.email !== currentData.email) {
      const emailSnap = await db
        .collection("system_users")
        .where("email", "==", sanitizedUpdates.email)
        .get();
      if (emailSnap.docs.some((doc) => doc.id !== userDocRef.id)) {
        return NextResponse.json(
          { error: "Email already exists ❌" },
          { status: 409 },
        );
      }
    }

    const after = {
      ...currentData,
      ...sanitizedUpdates,
      updatedAt: new Date(),
    };

    await userDocRef.update(after);
    await writeAuditLog({
      req,
      actor: user,
      action: "user.update",
      targetType: "user",
      targetId: userDocRef.id,
      targetLabel: String(after.username || currentData.username || ""),
      before: currentData,
      after,
    });
    cacheComponent.invalidatePrefix("users:");
    return NextResponse.json({ message: "User updated successfully ✅" });
  } catch {
    return NextResponse.json(
      { error: "Failed to update user ❌" },
      { status: 500 },
    );
  }
}
