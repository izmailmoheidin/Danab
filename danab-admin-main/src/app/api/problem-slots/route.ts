import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";

const CACHE_TTL_MS = 30_000;

// GET all problem slots
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, [
    "moderator",
    "admin",
  ]);
  if (roleCheck) return roleCheck;

  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    if (fresh) cacheComponent.invalidatePrefix("problem_slots:");

    const slots = await cacheComponent.remember(
      "problem_slots:all",
      CACHE_TTL_MS,
      async () => {
        const snapshot = await db.collection("problem_slots").orderBy("createdAt", "desc").get();
        return snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      },
    );
    return NextResponse.json(slots, {
      headers: {
        "Cache-Control": fresh
          ? "no-store"
          : buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error("❌ Error fetching problem slots:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — resolve or unresolve a problem slot
export async function PATCH(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, [
    "moderator",
    "admin",
  ]);
  if (roleCheck) return roleCheck;

  try {
    const { id, resolved } = await req.json();

    if (!id || typeof resolved !== "boolean") {
      return NextResponse.json(
        { error: "id and resolved (boolean) are required" },
        { status: 400 },
      );
    }

    const docRef = db.collection("problem_slots").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "Problem slot not found" },
        { status: 404 },
      );
    }

    await docRef.update({
      resolved,
      resolvedAt: resolved ? new Date() : null,
    });

    cacheComponent.invalidatePrefix("problem_slots:");

    return NextResponse.json({
      success: true,
      message: resolved ? "Slot marked as resolved" : "Slot marked as unresolved",
    });
  } catch (err: any) {
    console.error("❌ Error updating problem slot:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove a problem slot record
export async function DELETE(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, ["admin"]);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 },
      );
    }

    const docRef = db.collection("problem_slots").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "Problem slot not found" },
        { status: 404 },
      );
    }

    await docRef.delete();
    cacheComponent.invalidatePrefix("problem_slots:");

    return NextResponse.json({
      success: true,
      message: "Problem slot deleted",
    });
  } catch (err: any) {
    console.error("❌ Error deleting problem slot:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
