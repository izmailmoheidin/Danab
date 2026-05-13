import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getDayBoundsUTC3, calculateUniqueRevenue } from "@/lib/timeUtils";
import { resolveStationCodeByImei } from "@/lib/imeiMap";
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
  const stationCode = await resolveStationCodeByImei(imei);

  if (!stationCode) {
    return NextResponse.json(
      { error: `Unknown IMEI ${imei}` },
      { status: 400 },
    );
  }

  const { startUtc, endUtc, dateStr } = getDayBoundsUTC3();

  try {
    const payload = await cacheComponent.remember(
      `revenue:daily:imei:${imei}:${dateStr}`,
      CACHE_TTL_MS,
      async () => {
        const Timestamp = admin.firestore.Timestamp;
        const snapshot = await db
          .collection(RENTALS_COLLECTION)
          .where("stationCode", "==", stationCode)
          .where("timestamp", ">=", Timestamp.fromDate(startUtc))
          .where("timestamp", "<", Timestamp.fromDate(endUtc))
          .where("status", "in", ["rented", "returned"])
          .get();

        const { total, count } = calculateUniqueRevenue(snapshot.docs);

        return {
          imei,
          stationCode,
          totalRevenueToday: total,
          totalRentalsToday: count,
          date: dateStr,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (error: any) {
    console.error("❌ Error calculating daily revenue:", error);
    return NextResponse.json(
      { error: "Failed to calculate daily revenue ❌" },
      { status: 500 },
    );
  }
}
