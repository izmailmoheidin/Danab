"use client";

import { useEffect, useState } from "react";

type LiveStation = {
  code: string;
  imei: string;
  name: string;
  location: string;
  online: boolean;
  totalBatteries: number;
  rentableCount: number;
  url: string;
  error: string | null;
};

export function Stations() {
  const [stations, setStations] = useState<LiveStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const isLocalHost = (() => {
      if (typeof window === "undefined") return false;
      const h = window.location.hostname;
      return (
        h === "localhost" ||
        h === "127.0.0.1" ||
        h.endsWith(".local") ||
        h.startsWith("192.168.") ||
        h.startsWith("10.")
      );
    })();
    const load = async () => {
      try {
        const res = await fetch("/api/mobile/stations", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !Array.isArray(body?.stations)) {
          setErrorMessage(body?.error || "Failed to load stations");
          setStations([]);
        } else {
          // When running locally, rewrite production subdomain URLs to a
          // local route so testing works without per-station subdomains.
          const stations = (body.stations as LiveStation[]).map((s) =>
            isLocalHost ? { ...s, url: `/station?code=${s.code}` } : s,
          );
          setStations(stations);
          setErrorMessage("");
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  return (
    <section id="stations" className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-pink-500">
            Our Locations
          </p>
          <h2 className="mt-3 text-3xl font-black text-gray-900 sm:text-4xl">
            Find a Station
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600">
            Danab stations are placed at popular cafes and restaurants across
            Mogadishu. More locations coming soon.
          </p>
        </div>

        {loading ? (
          <p className="mt-12 text-center text-sm text-gray-500">
            Loading stations…
          </p>
        ) : errorMessage ? (
          <p className="mt-12 text-center text-sm text-red-600">
            {errorMessage}
          </p>
        ) : stations.length === 0 ? (
          <p className="mt-12 text-center text-sm text-gray-500">
            No stations available right now.
          </p>
        ) : (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((station) => {
              const isUsable = station.online && station.rentableCount > 0;
              return (
                <a
                  key={station.imei}
                  href={station.url}
                  target={station.url.startsWith("/") ? "_self" : "_blank"}
                  rel="noopener noreferrer"
                  className={`group flex items-center gap-4 rounded-2xl border p-5 shadow-sm transition-all ${
                    isUsable
                      ? "border-gray-100 bg-gray-50 hover:border-pink-200 hover:bg-pink-50 hover:shadow-md"
                      : "border-gray-100 bg-gray-50 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-sm font-black text-white shadow-md">
                    {station.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 group-hover:text-pink-600">
                      {station.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {station.location}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          station.online
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            station.online ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                        {station.online ? "Online" : "Offline"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          station.rentableCount > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {station.rentableCount} ready
                      </span>
                    </div>
                  </div>
                  <svg
                    className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-pink-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m9 5 7 7-7 7"
                    />
                  </svg>
                </a>
              );
            })}
          </div>
        )}

        <div className="relative mt-10 rounded-2xl border border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50 p-6 text-center sm:p-8">
          <a
            href="https://www.danabadmins.online/"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600"
            aria-label="Admin"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
          <h3 className="text-lg font-bold text-gray-900">Admin System</h3>
          <p className="mt-2 text-sm text-gray-600">
            Manage stations, view rentals, and monitor your Danab network.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-6 text-center sm:p-8">
          <h3 className="text-lg font-bold text-purple-900">
            Want Danab at Your Location?
          </h3>
          <p className="mt-2 text-sm text-purple-700">
            We&apos;re expanding! If you own a cafe, restaurant, or business and
            want a Danab station, contact us.
          </p>
          <a
            href="#contact"
            className="mt-4 inline-block rounded-xl bg-purple-700 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-purple-800 hover:shadow-lg"
          >
            Partner With Us
          </a>
        </div>
      </div>
    </section>
  );
}
