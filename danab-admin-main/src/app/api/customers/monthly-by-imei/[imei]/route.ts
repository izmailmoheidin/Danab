import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone } from "@/lib/activeRentals";
import { getMonthBoundsUTC3 } from "@/lib/timeUtils";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 30_000;

export async function GET(
  req: NextRequest,
  { params }: { params: { imei: string } },
) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, [
    "user",
    "moderator",
    "admin",
  ]);
  if (roleCheck) return roleCheck;

  const { imei } = params;
  const { startUtc, endUtc, monthKey } = getMonthBoundsUTC3();

  try {
    const payload = await cacheComponent.remember(
      `customers:monthly:imei:${imei}:${monthKey}`,
      CACHE_TTL_MS,
      async () => {
        const Timestamp = admin.firestore.Timestamp;
        const snapshot = await db
          .collection(RENTALS_COLLECTION)
          .where("imei", "==", imei)
          .where("timestamp", ">=", Timestamp.fromDate(startUtc))
          .where("timestamp", "<", Timestamp.fromDate(endUtc))
          .where("status", "in", ["rented", "returned"])
          .get();

        const phones = new Set<string>();
        snapshot.forEach((doc: any) => {
          const num = getTrustedRentalPhone(doc.data());
          if (num) phones.add(num);
        });

        return {
          imei,
          month: monthKey,
          totalCustomersThisMonth: phones.size,
          totalRentalsThisMonth: snapshot.size,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error("❌ Monthly customer error:", err);
    return NextResponse.json(
      { error: "Failed to fetch monthly customer count" },
      { status: 500 },
    );
  }
}
