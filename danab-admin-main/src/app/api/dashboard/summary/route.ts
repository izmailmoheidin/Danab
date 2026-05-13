import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone } from "@/lib/activeRentals";
import {
  calculateUniqueRevenue,
  getDayBoundsUTC3,
  getMonthBoundsUTC3,
} from "@/lib/timeUtils";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 30_000;

function countFromSnapshot(snap: any) {
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
}

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
  const {
    startUtc: monthStartUtc,
    endUtc: monthEndUtc,
    monthKey,
  } = getMonthBoundsUTC3();

  try {
    const payload = await cacheComponent.remember(
      `dashboard:summary:${dateStr}:${monthKey}`,
      CACHE_TTL_MS,
      async () => {
        const Timestamp = admin.firestore.Timestamp;

        const [dailySnap, monthlySnap] = await Promise.all([
          db
            .collection(RENTALS_COLLECTION)
            .where("timestamp", ">=", Timestamp.fromDate(startUtc))
            .where("timestamp", "<", Timestamp.fromDate(endUtc))
            .where("status", "in", ["rented", "returned"])
            .get(),
          db
            .collection(RENTALS_COLLECTION)
            .where("timestamp", ">=", Timestamp.fromDate(monthStartUtc))
            .where("timestamp", "<", Timestamp.fromDate(monthEndUtc))
            .where("status", "in", ["rented", "returned"])
            .get(),
        ]);

        const dailyRevenue = calculateUniqueRevenue(dailySnap.docs);
        const dailyCounts = countFromSnapshot(dailySnap);

        const monthlyRevenue = calculateUniqueRevenue(monthlySnap.docs);
        const monthlyCounts = countFromSnapshot(monthlySnap);

        return {
          daily: {
            date: dateStr,
            totalRevenueToday: dailyRevenue.total,
            totalRentalsToday: dailyRevenue.count,
            totalCustomersToday: dailyCounts.customers,
            stations: dailyCounts.stations,
          },
          monthly: {
            month: monthKey,
            totalRevenueMonthly: monthlyRevenue.total,
            totalRentalsThisMonth: monthlyRevenue.count,
            totalCustomersThisMonth: monthlyCounts.customers,
            stations: monthlyCounts.stations,
          },
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (error: any) {
    console.error("Dashboard summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard summary" },
      { status: 500 },
    );
  }
}
