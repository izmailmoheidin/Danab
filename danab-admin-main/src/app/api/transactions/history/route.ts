import { NextRequest, NextResponse } from "next/server";

import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone, hasRentalPhoneMismatch } from "@/lib/activeRentals";
import { loadOfficialActiveRentals } from "@/lib/batteryState";
import { normalizeBatteryId } from "@/lib/batteryId";
import {
  buildPrivateCacheControl,
  cacheComponent,
} from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 20_000;
const SOMALIA_UTC_OFFSET = "+03:00";

function normalizeStatusFilter(value: string | null) {
  return (value || "all").trim().toLowerCase();
}

function parseDateBoundary(value: string, endOfDay = false): number | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const parsed = new Date(`${trimmed}T${time}${SOMALIA_UTC_OFFSET}`);
  const timestamp = parsed.getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function getTimestampMillis(value: any): number | null {
  if (!value) return null;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value._seconds === "number") {
    const nanoseconds = typeof value._nanoseconds === "number" ? value._nanoseconds : 0;
    return value._seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return null;
}

function hasSearchFilters(req: NextRequest) {
  return [
    req.nextUrl.searchParams.get("phone"),
    req.nextUrl.searchParams.get("battery"),
    req.nextUrl.searchParams.get("waafi"),
    req.nextUrl.searchParams.get("station"),
    req.nextUrl.searchParams.get("status"),
    req.nextUrl.searchParams.get("startDate"),
    req.nextUrl.searchParams.get("endDate"),
  ].some((value) => value && value.trim().length > 0 && value !== "all");
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
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const phoneQuery = (req.nextUrl.searchParams.get("phone") || "")
      .replace(/\D/g, "")
      .trim();
    const batteryQuery = (req.nextUrl.searchParams.get("battery") || "")
      .trim();
    const waafiQuery = (req.nextUrl.searchParams.get("waafi") || "")
      .trim()
      .toLowerCase();
    const stationQuery = (req.nextUrl.searchParams.get("station") || "")
      .trim()
      .toLowerCase();
    const statusFilter = normalizeStatusFilter(
      req.nextUrl.searchParams.get("status"),
    );
    const startDate = (req.nextUrl.searchParams.get("startDate") || "").trim();
    const endDate = (req.nextUrl.searchParams.get("endDate") || "").trim();
    const filteredSearch = hasSearchFilters(req);
    const startBoundary = parseDateBoundary(startDate, false);
    const endBoundary = parseDateBoundary(endDate, true);
    const rangeStart =
      startBoundary !== null && endBoundary !== null
        ? Math.min(startBoundary, endBoundary)
        : startBoundary;
    const rangeEnd =
      startBoundary !== null && endBoundary !== null
        ? Math.max(startBoundary, endBoundary)
        : endBoundary;

    if (fresh || filteredSearch) {
      cacheComponent.invalidate("transactions:history");
    }

    const loadTransactions = async () => {
      const rentalsSnapshot = await db
        .collection(RENTALS_COLLECTION)
        .orderBy("timestamp", "desc")
        .get();

      const rentals = rentalsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const officialActiveRentals = await loadOfficialActiveRentals();

      if (rentals.length === 0 && officialActiveRentals.length === 0) {
        return [];
      }

      const stationMap: Record<string, string> = {};
      const stationSnapshot = await db.collection("stations").get();

      stationSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.imei) {
          stationMap[data.imei] = data.name || data.imei;
        }
        if (data.stationCode) {
          stationMap[data.stationCode] = data.name || data.stationCode;
        }
      });

      const enrichedRentals = rentals.map((r: any) => ({
        ...r,
        waafiConfirmedPhoneNumber: r.waafiConfirmedPhoneNumber || "",
        requestedPhoneNumber: r.requestedPhoneNumber || "",
        storedPhoneNumber: r.phoneNumber || "",
        phoneNumber: getTrustedRentalPhone(r),
        phoneNumberMismatch: hasRentalPhoneMismatch(r),
        phoneAuthority: r.phoneAuthority || null,
        stationName:
          stationMap[r.imei] ||
          stationMap[r.stationCode] ||
          r.stationCode ||
          r.imei ||
          null,
      }));

      const enrichedOfficialActiveRentals = officialActiveRentals.map((r: any) => ({
        ...r,
        waafiConfirmedPhoneNumber: r.waafiConfirmedPhoneNumber || "",
        requestedPhoneNumber: r.requestedPhoneNumber || "",
        storedPhoneNumber: r.phoneNumber || "",
        phoneNumber: getTrustedRentalPhone(r),
        phoneNumberMismatch: hasRentalPhoneMismatch(r),
        phoneAuthority: r.phoneAuthority || null,
        stationName:
          stationMap[r.imei] ||
          stationMap[r.stationCode] ||
          r.stationCode ||
          r.imei ||
          null,
      }));
      const officialById = new Map(
        enrichedOfficialActiveRentals.map((row: any) => [String(row.id || ""), row]),
      );
      const sourceRentals =
        statusFilter === "rented"
          ? enrichedOfficialActiveRentals
          : enrichedRentals.map((row: any) => {
              const normalizedStatus = String(row.status || "").toLowerCase();
              if (
                normalizedStatus !== "returned" &&
                normalizedStatus !== "completed" &&
                officialById.has(String(row.id || ""))
              ) {
                return officialById.get(String(row.id || ""))!;
              }
              return row;
            });

      if (!filteredSearch) {
        return sourceRentals;
      }

      return sourceRentals.filter((r: any) => {
        const normalizedStatus = String(r.status || "").toLowerCase();
        const normalizedPhone = String(getTrustedRentalPhone(r) || "").replace(
          /\D/g,
          "",
        );
        const normalizedBattery = normalizeBatteryId(r.battery_id);
        const timestampMs = getTimestampMillis(r.timestamp);
        const normalizedStationText = [
          r.imei,
          r.stationCode,
          r.stationName,
          stationMap[r.imei],
          stationMap[r.stationCode],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const normalizedWaafi = [
          r.transactionId,
          r.issuerTransactionId,
          r.referenceId,
          r.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "returned"
              ? normalizedStatus === "returned" ||
                normalizedStatus === "completed"
              : normalizedStatus !== "returned" &&
                normalizedStatus !== "completed";

        if (!matchesStatus) {
          return false;
        }

        if (phoneQuery && !normalizedPhone.includes(phoneQuery)) {
          return false;
        }

        if (
          batteryQuery &&
          !normalizedBattery.includes(normalizeBatteryId(batteryQuery))
        ) {
          return false;
        }

        if (waafiQuery && !normalizedWaafi.includes(waafiQuery)) {
          return false;
        }

        if (stationQuery && !normalizedStationText.includes(stationQuery)) {
          return false;
        }

        if (
          rangeStart !== null &&
          (timestampMs === null || timestampMs < rangeStart)
        ) {
          return false;
        }

        if (rangeEnd !== null && (timestampMs === null || timestampMs > rangeEnd)) {
          return false;
        }

        return true;
      });
    };

    const payload =
      fresh || filteredSearch
        ? await loadTransactions()
        : await cacheComponent.remember(
            "transactions:history",
            CACHE_TTL_MS,
            loadTransactions,
          );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": fresh || filteredSearch
          ? "no-store, max-age=0"
          : buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (error: any) {
    console.error("❌ Error fetching transaction history:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction history" },
      { status: 500 },
    );
  }
}
