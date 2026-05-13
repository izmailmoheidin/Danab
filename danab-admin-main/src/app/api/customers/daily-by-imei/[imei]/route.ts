import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone } from "@/lib/activeRentals";
import { getDayBoundsUTC3 } from "@/lib/timeUtils";
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
  const { startUtc, endUtc, dateStr } = getDayBoundsUTC3();

  try {
    const payload = await cacheComponent.remember(
      `customers:daily:imei:${imei}:${dateStr}`,
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

        const uniquePhones = new Set<string>();
        snapshot.forEach((doc: any) => {
          const data = doc.data();
          const trustedPhone = getTrustedRentalPhone(data);
          if (trustedPhone) uniquePhones.add(trustedPhone);
        });

        return {
          imei,
          date: dateStr,
          totalCustomersToday: uniquePhones.size,
          totalRentalsToday: snapshot.size,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error("❌ Error calculating daily rentals:", err);
    return NextResponse.json(
      { error: "Failed to fetch daily customer count" },
      { status: 500 },
    );
  }
}
