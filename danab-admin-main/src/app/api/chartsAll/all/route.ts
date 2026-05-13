import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone } from "@/lib/activeRentals";
import { applyRevenueCuts } from "@/lib/timeUtils";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 60_000;
const SOMALIA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

function toSomaliaDate(d: Date) {
  return new Date(d.getTime() + SOMALIA_OFFSET_MS);
}

function isoDateUTC3(d: Date) {
  const s = toSomaliaDate(d);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-${String(s.getUTCDate()).padStart(2, "0")}`;
}

function weekKeyUTC3(d: Date) {
  const s = toSomaliaDate(d);
  const dt = new Date(
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()),
  );
  const dayOfWeek = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - dayOfWeek + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function monthKeyUTC3(d: Date) {
  const s = toSomaliaDate(d);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}`;
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

  try {
    const payload = await cacheComponent.remember(
      "charts:all",
      CACHE_TTL_MS,
      async () => {
        const rentalsSnapshot = await db.collection(RENTALS_COLLECTION).get();

        const dailyRevenue: Record<string, number> = {};
        const weeklyRevenue: Record<string, number> = {};
        const monthlyRevenue: Record<string, number> = {};
        const dailyCustomers: Record<string, Set<string>> = {};
        const weeklyCustomers: Record<string, Set<string>> = {};
        const monthlyCustomers: Record<string, Set<string>> = {};

        rentalsSnapshot.forEach((doc: any) => {
          const data = doc.data();
          const { timestamp, amount } = data;
          const phoneNumber = getTrustedRentalPhone(data);
          if (!timestamp || !amount || !phoneNumber) return;

          const date = timestamp.toDate();
          const day = isoDateUTC3(date);
          const week = weekKeyUTC3(date);
          const month = monthKeyUTC3(date);

          const netAmount = amount > 0 ? applyRevenueCuts(amount) : 0;
          dailyRevenue[day] = (dailyRevenue[day] || 0) + netAmount;
          weeklyRevenue[week] = (weeklyRevenue[week] || 0) + netAmount;
          monthlyRevenue[month] = (monthlyRevenue[month] || 0) + netAmount;

          dailyCustomers[day] = dailyCustomers[day] || new Set();
          dailyCustomers[day].add(phoneNumber);
          weeklyCustomers[week] = weeklyCustomers[week] || new Set();
          weeklyCustomers[week].add(phoneNumber);
          monthlyCustomers[month] = monthlyCustomers[month] || new Set();
          monthlyCustomers[month].add(phoneNumber);
        });

        const formatChart = (obj: Record<string, any>, isSet = false) => {
          const labels = Object.keys(obj).sort();
          const data = labels.map((label) =>
            isSet ? obj[label].size : obj[label],
          );
          return { labels, data };
        };

        return {
          dailyRevenue: formatChart(dailyRevenue),
          weeklyRevenue: formatChart(weeklyRevenue),
          monthlyRevenue: formatChart(monthlyRevenue),
          dailyCustomers: formatChart(dailyCustomers, true),
          weeklyCustomers: formatChart(weeklyCustomers, true),
          monthlyCustomers: formatChart(monthlyCustomers, true),
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error("Error in /api/chartsAll/all:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
