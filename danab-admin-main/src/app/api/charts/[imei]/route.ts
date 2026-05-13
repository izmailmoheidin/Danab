import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone } from "@/lib/activeRentals";
import { applyRevenueCuts } from "@/lib/timeUtils";
import { resolveStationCodeByImei } from "@/lib/imeiMap";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 60_000;
const SOMALIA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

// Convert a UTC Date to a Somalia-local ISO date string (YYYY-MM-DD)
function isoDateUTC3(d: Date) {
  const local = new Date(d.getTime() + SOMALIA_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ISO week number based on Somalia-local date
function getWeekNumberUTC3(d: Date) {
  const local = new Date(d.getTime() + SOMALIA_OFFSET_MS);
  const dt = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Month label based on Somalia-local date (e.g. "January 2025")
function monthLabelUTC3(d: Date) {
  const local = new Date(d.getTime() + SOMALIA_OFFSET_MS);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}

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

  try {
    const { imei } = params;
    const stationCode = await resolveStationCodeByImei(imei);

    if (!stationCode) {
      return NextResponse.json({ error: "Invalid IMEI" }, { status: 400 });
    }

    const payload = await cacheComponent.remember(
      `charts:imei:${imei}`,
      CACHE_TTL_MS,
      async () => {
        const snapshot = await db
          .collection(RENTALS_COLLECTION)
          .where("stationCode", "==", stationCode)
          .where("status", "in", ["rented", "returned"])
          .get();

        const dailyRev: Record<string, number> = {};
        const weeklyRev: Record<string, number> = {};
        const monthlyRev: Record<string, number> = {};
        const dailyCust: Record<string, Set<string>> = {};
        const weeklyCust: Record<string, Set<string>> = {};
        const monthlyCust: Record<string, Set<string>> = {};

        snapshot.forEach((doc: any) => {
          const r = doc.data();
          if (!r.timestamp) return;

          const ts = r.timestamp.toDate();
          const day = isoDateUTC3(ts);
          const week = `Week ${getWeekNumberUTC3(ts)}`;
          const month = monthLabelUTC3(ts);

          const rawAmt = parseFloat(r.amount) || 0;
          const amt = rawAmt > 0 ? applyRevenueCuts(rawAmt) : 0;
          const phone = getTrustedRentalPhone(r);

          dailyRev[day] = (dailyRev[day] || 0) + amt;
          weeklyRev[week] = (weeklyRev[week] || 0) + amt;
          monthlyRev[month] = (monthlyRev[month] || 0) + amt;

          dailyCust[day] = dailyCust[day] || new Set();
          weeklyCust[week] = weeklyCust[week] || new Set();
          monthlyCust[month] = monthlyCust[month] || new Set();

          dailyCust[day].add(phone);
          weeklyCust[week].add(phone);
          monthlyCust[month].add(phone);
        });

        const build = (
          rev: Record<string, number>,
          cust: Record<string, Set<string>>,
        ) => ({
          labels: Object.keys(rev).sort(),
          data: Object.keys(rev)
            .sort()
            .map((k) => rev[k]),
          customers: Object.keys(cust)
            .sort()
            .map((k) => cust[k].size),
        });

        const daily = build(dailyRev, dailyCust);
        const weekly = build(weeklyRev, weeklyCust);
        const monthly = build(monthlyRev, monthlyCust);

        return {
          dailyRevenue: {
            labels: daily.labels,
            data: daily.data,
          },
          weeklyRevenue: {
            labels: weekly.labels,
            data: weekly.data,
          },
          monthlyRevenue: {
            labels: monthly.labels,
            data: monthly.data,
          },
          dailyCustomers: {
            labels: daily.labels,
            data: daily.customers,
          },
          weeklyCustomers: {
            labels: weekly.labels,
            data: weekly.customers,
          },
          monthlyCustomers: {
            labels: monthly.labels,
            data: monthly.customers,
          },
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error("Charts error:", err);
    return NextResponse.json(
      { error: "Failed to generate charts" },
      { status: 500 },
    );
  }
}
