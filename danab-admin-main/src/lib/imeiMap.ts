import db from "@/lib/firebase-admin";

// Firestore-backed IMEI → stationCode resolver.
//
// Previously this file held a hardcoded map that fell out of sync with the
// stations collection in Firestore (which is what the admin UI manages).
// That caused the Station Comparison / Charts / Revenue-per-station
// endpoints to either 400 ("Invalid IMEI") or query the wrong stationCode
// and return zero results.
//
// We now resolve from the `stations` collection (single source of truth),
// cached in-process for `CACHE_TTL_MS` to avoid hammering Firestore.

type ImeiCodeMap = Record<string, string>;

const CACHE_TTL_MS = 60_000;

let cachedMap: ImeiCodeMap | null = null;
let cachedAt = 0;
let inFlight: Promise<ImeiCodeMap> | null = null;

async function buildImeiCodeMap(): Promise<ImeiCodeMap> {
  const snap = await db.collection("stations").get();
  const map: ImeiCodeMap = {};
  snap.forEach((doc) => {
    const data = doc.data() as Record<string, any>;
    const imei = String(data.imei || doc.id || "").trim();
    if (!imei) return;
    const code = String(data.stationCode || "").replace(/\D/g, "");
    if (code) {
      map[imei] = code;
    }
  });
  return map;
}

export async function getImeiToStationCodeMap(): Promise<ImeiCodeMap> {
  const now = Date.now();
  if (cachedMap && now - cachedAt < CACHE_TTL_MS) {
    return cachedMap;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = buildImeiCodeMap()
    .then((map) => {
      cachedMap = map;
      cachedAt = Date.now();
      return map;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function resolveStationCodeByImei(
  imei: string,
): Promise<string | null> {
  if (!imei) return null;
  const map = await getImeiToStationCodeMap();
  return map[imei] || null;
}

// Backwards-compatible synchronous-like accessor used by older code paths.
// Returns the cached map (may be empty on cold start; first request triggers
// a background refresh). Prefer `resolveStationCodeByImei()` in new code.
export const imeiToStationCode = new Proxy({} as ImeiCodeMap, {
  get(_target, prop: string) {
    // Trigger a background refresh if cold; do not block.
    if (!cachedMap) {
      void getImeiToStationCodeMap().catch(() => undefined);
      return undefined;
    }
    return cachedMap[prop];
  },
});
