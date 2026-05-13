import { getDb } from "@/lib/server/firebase-admin";
import { getRequiredEnv } from "@/lib/server/env";
import { queryStationBatteries } from "@/lib/server/payment/heycharge";

export type EnrichedStation = {
  code: string;
  imei: string;
  name: string;
  location: string;
  online: boolean;
  totalBatteries: number;
  rentableCount: number;
  url: string;
  lastFetchedAt: string;
  error: string | null;
};

const STATION_QUERY_TIMEOUT_MS = 8_000;
const MIN_RENTABLE_PERCENT = 60;

type FirestoreStation = {
  imei: string;
  name: string;
  location: string;
  totalSlots: number;
  code: string | null;
};

/**
 * Build a map from IMEI → station code by reading STATION_<code>_IMEI env vars.
 * This lets us reverse-look-up the customer-facing station code (58, 59, …)
 * from the IMEI stored in Firestore by the admin app.
 */
function buildImeiToCodeMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^STATION_(\d+)_IMEI$/);
    if (match && typeof value === "string" && value.trim().length > 0) {
      map.set(value.trim(), match[1]);
    }
  }
  return map;
}

function deriveStationCode(
  imei: string,
  storedCode: string | null,
  imeiToCodeMap: Map<string, string>,
): string {
  const fromDoc = String(storedCode || "").replace(/\D/g, "");
  if (fromDoc) return fromDoc;

  const fromEnv = imeiToCodeMap.get(imei);
  if (fromEnv) return fromEnv;

  // Last-resort fallback: last 4 digits of IMEI (still unique enough for UI).
  return imei.replace(/\D/g, "").slice(-4) || imei;
}

function buildStationUrl(code: string): string {
  const baseDomain = process.env.PUBLIC_STATION_DOMAIN || "danab.site";
  return `https://station${code}.${baseDomain}`;
}

async function fetchFirestoreStations(): Promise<FirestoreStation[]> {
  const snap = await getDb().collection("stations").get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      const imei = String(data.imei || doc.id || "").trim();
      if (!imei) return null;
      return {
        imei,
        name: String(data.name || "Unnamed Station"),
        location: String(data.location || "Not Set"),
        totalSlots: Number(data.totalSlots) || 0,
        code: data.stationCode ? String(data.stationCode) : null,
      } satisfies FirestoreStation;
    })
    .filter((station): station is FirestoreStation => station !== null);
}

async function fetchLiveStatus(imei: string): Promise<{
  online: boolean;
  totalBatteries: number;
  rentableCount: number;
  error: string | null;
}> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), STATION_QUERY_TIMEOUT_MS);
    try {
      const apiKey = getRequiredEnv("HEYCHARGE_API_KEY");
      const domain = getRequiredEnv("HEYCHARGE_DOMAIN");
      const auth = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
      const res = await fetch(`${domain}/v1/station/${imei}`, {
        headers: { Authorization: auth },
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as
        | { batteries?: unknown[]; station_status?: string }
        | null;
      if (!res.ok) {
        // Treat HeyCharge gating responses (402 subscription / 401-403 auth)
        // and other non-OK statuses as "Offline" rather than surfacing a raw
        // error to the customer. From the customer perspective the station
        // is simply unreachable.
        return {
          online: false,
          totalBatteries: 0,
          rentableCount: 0,
          error: null,
        };
      }
      const offline =
        String(body?.station_status || "").toLowerCase() === "offline";
      const batteries = Array.isArray(body?.batteries) ? body.batteries : [];
      const rentable = batteries.filter((b: any) => {
        return (
          Number(b?.battery_capacity) >= MIN_RENTABLE_PERCENT &&
          b?.lock_status === "1" &&
          b?.battery_abnormal === "0" &&
          b?.cable_abnormal === "0"
        );
      }).length;
      return {
        online: !offline,
        totalBatteries: batteries.length,
        rentableCount: rentable,
        error: null,
      };
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      online: false,
      totalBatteries: 0,
      rentableCount: 0,
      error: reason,
    };
  }
}

/**
 * Single source of truth for the customer-facing station list.
 * Reads from Firestore `stations` (admin-managed) and enriches each entry
 * with live HeyCharge online/offline + rentable battery count.
 */
export async function getEnrichedStations(): Promise<EnrichedStation[]> {
  const [stations, imeiToCodeMap] = await Promise.all([
    fetchFirestoreStations(),
    Promise.resolve(buildImeiToCodeMap()),
  ]);

  const fetchedAt = new Date().toISOString();
  const enriched = await Promise.all(
    stations.map(async (s) => {
      const code = deriveStationCode(s.imei, s.code, imeiToCodeMap);
      const live = await fetchLiveStatus(s.imei);
      return {
        code,
        imei: s.imei,
        name: s.name.replace(/\n+/g, " ").trim(),
        location: s.location,
        online: live.online,
        totalBatteries: live.totalBatteries,
        rentableCount: live.rentableCount,
        url: buildStationUrl(code),
        lastFetchedAt: fetchedAt,
        error: live.error,
      } satisfies EnrichedStation;
    }),
  );

  enriched.sort((a, b) => {
    const ac = Number(a.code) || Number.MAX_SAFE_INTEGER;
    const bc = Number(b.code) || Number.MAX_SAFE_INTEGER;
    if (ac !== bc) return ac - bc;
    return a.name.localeCompare(b.name);
  });
  return enriched;
}

/**
 * Look up a station's IMEI by its customer-facing code, consulting Firestore
 * first (so newly-added stations from the admin app work immediately) and
 * falling back to the STATION_<code>_IMEI env var.
 */
export async function resolveStationImeiByCode(
  code: string,
): Promise<{ imei: string; name: string } | null> {
  const normalized = String(code || "").replace(/\D/g, "");
  if (!normalized) return null;

  try {
    const stations = await fetchFirestoreStations();
    const imeiToCodeMap = buildImeiToCodeMap();
    const match = stations.find((s) => {
      const derived = deriveStationCode(s.imei, s.code, imeiToCodeMap);
      return derived === normalized;
    });
    if (match) {
      return { imei: match.imei, name: match.name };
    }
  } catch (err) {
    // Firestore unreachable → fall through to env var.
    console.warn(
      "resolveStationImeiByCode: Firestore lookup failed, using env fallback:",
      err instanceof Error ? err.message : err,
    );
  }

  const envImei = process.env[`STATION_${normalized}_IMEI`];
  if (envImei) {
    return { imei: envImei, name: `Station ${normalized}` };
  }

  return null;
}

// Re-export queryStationBatteries so consumers don't need a second import.
export { queryStationBatteries };
