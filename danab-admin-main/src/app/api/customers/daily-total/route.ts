import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone } from "@/lib/activeRentals";
import { getDayBoundsUTC3 } from "@/lib/timeUtils";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, [
    "user",
    "moderator",
    "admin",
  ]);
  if (roleCheck) return roleCheck;

  const { startUtc, endUtc, dateStr } = getDayBoundsUTC3();

  const countFromSnapshot = (snap: any) => {
    const uniqueCustomers = new Set<string>();
    const stationSet = new Set<string>();
    const uniqueTransactions = new Set<string>();
    snap.forEach((doc: any) => {
      const data = doc.data();
      const txId = data.transactionId || doc.id;
      if (uniqueTransactions.has(txId)) return;
      uniqueTransactions.add(txId);
      const trustedPhone = getTrustedRentalPhone(data);
      if (trustedPhone) uniqueCustomers.add(trustedPhone);
      if (data.imei) stationSet.add(data.imei);
    });
    return {
      customers: uniqueCustomers.size,
      rentals: uniqueTransactions.size,
      stations: stationSet.size,
    };
  };

  try {
    const payload = await cacheComponent.remember(
      `customers:daily:all:${dateStr}`,
      CACHE_TTL_MS,
      async () => {
        const Timestamp = admin.firestore.Timestamp;
        const snapshot = await db
          .collection(RENTALS_COLLECTION)
          .where("timestamp", ">=", Timestamp.fromDate(startUtc))
          .where("timestamp", "<", Timestamp.fromDate(endUtc))
          .where("status", "in", ["rented", "returned"])
          .get();

        const result = countFromSnapshot(snapshot);

        return {
          date: dateStr,
          totalCustomersToday: result.customers,
          totalRentalsToday: result.rentals,
          stations: result.stations,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error("❌ Daily-total error:", err);
    return NextResponse.json(
      { error: "Failed to fetch daily totals" },
      { status: 500 },
    );
  }
}
