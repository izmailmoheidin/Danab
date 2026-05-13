const STATION_NAMES: Record<string, string> = {
  "58": "Danab-Cafe Castello\nTaleex",
  "59": "Danab-Feynuus\nBowling",
  "60": "Danab-Java\nTaleex",
  "61": "Danab-Delik\nSomalia",
  "62": "Danab-Arena Cafe\nMogadishu",
};

export function getStationName(): string {
  if (typeof window === "undefined") {
    return "Danab Power Bank";
  }

  // 1. Prefer subdomain (production: station58.danab.site → "58")
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0];
  const fromSubdomain = subdomain.replace(/\D/g, "");
  if (fromSubdomain && STATION_NAMES[fromSubdomain]) {
    return STATION_NAMES[fromSubdomain];
  }

  // 2. Fallback to ?code=XX query param (used for local testing where
  //    per-station subdomains don't exist).
  const fromQuery = (
    new URLSearchParams(window.location.search).get("code") || ""
  ).replace(/\D/g, "");
  if (fromQuery && STATION_NAMES[fromQuery]) {
    return STATION_NAMES[fromQuery];
  }
  if (fromQuery) {
    return `Station ${fromQuery}`;
  }

  return "Danab Power Bank";
}
