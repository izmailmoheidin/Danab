import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { normalizeBatteryId } from "@/lib/batteryId";

const QUERY_TIMEOUT_MS = 12_000;

function normalizeState(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function isHealthyState(value?: string | null): boolean {
  const normalized = normalizeState(value);

  if (!normalized) {
    return true;
  }

  return [
    "normal",
    "online",
    "available",
    "ok",
    "healthy",
    "1",
  ].includes(normalized);
}

function toInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

type RawBattery = {
  battery_id?: string;
  slot_id?: string;
  battery_capacity?: string;
  battery_abnormal?: string;
  cable_abnormal?: string;
  lock_status?: string;
  battery_status?: string;
  slot_status?: string;
  battery_soh?: string;
};

type LiveStation = {
  imei: string;
  name: string;
  location: string;
  iccid: string;
  station_status: string;
  fetchedAt: string;
  totalBatteries: number;
  rentableCount: number;
  lowBatteryCount: number;
  problemCount: number;
  offlineCount: number;
  batteries: Array<{
    battery_id: string;
    slot_id: string;
    battery_capacity: number | null;
    battery_soh: number | null;
    lock_status: string;
    battery_status: string;
    slot_status: string;
    battery_abnormal: string;
    cable_abnormal: string;
    rentable: boolean;
    issue: string | null;
  }>;
};

function mapBattery(raw: RawBattery) {
  const batteryId = normalizeBatteryId(raw.battery_id) || String(raw.battery_id || "");
  const slotId = String(raw.slot_id || "");
  const batteryCapacity = toInt(raw.battery_capacity);
  const batterySoh = toInt(raw.battery_soh);
  const lockStatus = String(raw.lock_status || "");
  const batteryStatus = String(raw.battery_status || "");
  const slotStatus = String(raw.slot_status || "");
  const batteryAbnormal = String(raw.battery_abnormal || "");
  const cableAbnormal = String(raw.cable_abnormal || "");

  let issue: string | null = null;
  if (lockStatus !== "1") {
    issue = "Battery offline";
  } else if (!isHealthyState(slotStatus)) {
    issue = `Slot issue: ${slotStatus || "abnormal"}`;
  } else if (!isHealthyState(batteryStatus)) {
    issue = `Battery issue: ${batteryStatus || "abnormal"}`;
  } else if (batteryAbnormal !== "0") {
    issue = "Battery abnormal";
  } else if (cableAbnormal !== "0") {
    issue = "Cable abnormal";
  } else if (batteryCapacity !== null && batteryCapacity < 60) {
    issue = "Low battery";
  }

  return {
    battery_id: batteryId,
    slot_id: slotId,
    battery_capacity: batteryCapacity,
    battery_soh: batterySoh,
    lock_status: lockStatus,
    battery_status: batteryStatus,
    slot_status: slotStatus,
    battery_abnormal: batteryAbnormal,
    cable_abnormal: cableAbnormal,
    rentable: issue === null,
    issue,
  };
}

async function fetchStationLive(imei: string, meta: Record<string, any>) {
  const apiKey = process.env.HEYCHARGE_API_KEY;
  const domain = process.env.HEYCHARGE_DOMAIN;

  if (!apiKey || !domain) {
    throw new Error("HeyCharge credentials not configured");
  }

  const url = `${domain}/v1/station/${imei}`;
  let data: { batteries?: unknown[]; station_status?: string } | undefined;
  try {
    const response = await axios.get(url, {
      auth: { username: apiKey, password: "" },
      timeout: QUERY_TIMEOUT_MS,
    });
    data = response.data;
  } catch (error: any) {
    const status = error?.response?.status;
    // Treat HeyCharge gating errors (402 subscription / 401-403 auth) as
    // "Offline" rather than a hard error. From a customer/admin perspective
    // the station is simply unreachable — the cause (charger unplugged,
    // billing lapsed, etc.) is operational, not a code failure.
    if (status === 402 || status === 401 || status === 403) {
      data = { batteries: [], station_status: "Offline" };
    } else {
      throw error;
    }
  }

  const batteries = Array.isArray(data?.batteries)
    ? (data.batteries as RawBattery[]).map(mapBattery).sort((left, right) => {
        return Number(left.slot_id) - Number(right.slot_id);
      })
    : [];

  return {
    imei,
    name: meta.name || "Unnamed Station",
    location: meta.location || "Not Set",
    iccid: meta.iccid || "Unknown",
    station_status: data?.station_status === "Offline" ? "Offline" : "Online",
    fetchedAt: new Date().toISOString(),
    totalBatteries: batteries.length,
    rentableCount: batteries.filter((battery) => battery.rentable).length,
    lowBatteryCount: batteries.filter((battery) => battery.issue === "Low battery").length,
    problemCount: batteries.filter(
      (battery) =>
        battery.issue !== null &&
        battery.issue !== "Low battery" &&
        battery.issue !== "Battery offline",
    ).length,
    offlineCount: batteries.filter((battery) => battery.issue === "Battery offline").length,
    batteries,
  } satisfies LiveStation;
}

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, ["moderator", "admin"]);
  if (roleCheck) return roleCheck;

  try {
    const imeiFilter = String(req.nextUrl.searchParams.get("imei") || "").trim();

    let stationQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection("stations");
    if (imeiFilter) {
      stationQuery = stationQuery.where("imei", "==", imeiFilter);
    }

    const stationsSnap = await stationQuery.get();
    if (stationsSnap.empty) {
      return NextResponse.json({ stations: [] }, { status: 200 });
    }

    const results = await Promise.all(
      stationsSnap.docs.map(async (doc) => {
        const meta = doc.data() || {};
        const imei = String(meta.imei || doc.id || "");

        try {
          const live = await fetchStationLive(imei, meta);
          return { success: true, ...live };
        } catch (error: any) {
          return {
            success: false,
            imei,
            name: meta.name || "Unnamed Station",
            location: meta.location || "Not Set",
            iccid: meta.iccid || "Unknown",
            station_status: "Unknown",
            fetchedAt: new Date().toISOString(),
            totalBatteries: 0,
            rentableCount: 0,
            lowBatteryCount: 0,
            problemCount: 0,
            offlineCount: 0,
            batteries: [],
            error: error?.message || "Failed to query HeyCharge",
          };
        }
      }),
    );

    results.sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json(
      {
        stations: results,
        fetchedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch live HeyCharge batteries" },
      { status: 500 },
    );
  }
}
