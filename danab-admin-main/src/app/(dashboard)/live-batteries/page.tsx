"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faExclamationTriangle,
  faSearch,
  faSpinner,
  faSyncAlt,
  faWarehouse,
} from "@fortawesome/free-solid-svg-icons";

import { apiService } from "@/lib/api";

type LiveBattery = {
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
};

type LiveStation = {
  success: boolean;
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
  batteries: LiveBattery[];
  error?: string;
};

type IssueFilter = "all" | "issues" | "rentable";

function formatTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LiveBatteriesPage() {
  const [stations, setStations] = useState<LiveStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");

  const fetchLiveStations = async () => {
    try {
      setError("");
      const response = await apiService.getLiveHeyChargeStations();
      setStations(response.data.stations || []);
    } catch (err: any) {
      setError(
        err.response?.data?.error || "Failed to fetch live HeyCharge data",
      );
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await fetchLiveStations();
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchLiveStations();
    } finally {
      setRefreshing(false);
    }
  };

  const filteredStations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return stations.filter((station) => {
      const matchesSearch =
        !query ||
        station.name.toLowerCase().includes(query) ||
        station.location.toLowerCase().includes(query) ||
        station.imei.toLowerCase().includes(query) ||
        station.batteries.some(
          (battery) =>
            battery.battery_id.toLowerCase().includes(query) ||
            battery.slot_id.toLowerCase().includes(query),
        );

      if (!matchesSearch) return false;
      if (issueFilter === "issues") {
        return Boolean(
          station.error ||
            station.problemCount ||
            station.lowBatteryCount ||
            station.offlineCount,
        );
      }
      if (issueFilter === "rentable") {
        return station.rentableCount > 0;
      }
      return true;
    });
  }, [issueFilter, searchTerm, stations]);

  const totals = useMemo(() => {
    return stations.reduce(
      (acc, station) => {
        acc.stations += 1;
        acc.rentable += station.rentableCount;
        acc.lowBattery += station.lowBatteryCount;
        acc.problem += station.problemCount;
        acc.offline += station.offlineCount;
        return acc;
      },
      { stations: 0, rentable: 0, lowBattery: 0, problem: 0, offline: 0 },
    );
  }, [stations]);

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Live HeyCharge Batteries
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Direct station battery state from HeyCharge, without waiting for cron
            or station stats snapshots.
          </p>
        </div>

        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="inline-flex items-center justify-center px-4 py-2 font-semibold text-white transition rounded-lg shadow bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:opacity-60"
        >
          <FontAwesomeIcon
            icon={refreshing ? faSpinner : faSyncAlt}
            className={`mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh Live
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 xl:grid-cols-5">
        <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Stations</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {totals.stations}
          </p>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg shadow dark:bg-green-900/20 dark:border-green-800">
          <p className="text-sm text-green-700 dark:text-green-300">Rentable batteries</p>
          <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-200">
            {totals.rentable}
          </p>
        </div>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg shadow dark:bg-yellow-900/20 dark:border-yellow-800">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">Low battery</p>
          <p className="mt-1 text-2xl font-bold text-yellow-700 dark:text-yellow-200">
            {totals.lowBattery}
          </p>
        </div>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg shadow dark:bg-red-900/20 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">Problem slots/batteries</p>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-200">
            {totals.problem}
          </p>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg shadow dark:bg-slate-900/20 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">Offline batteries</p>
          <p className="mt-1 text-2xl font-bold text-slate-700 dark:text-slate-100">
            {totals.offline}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6 md:flex-row">
        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute text-gray-400 left-3 top-1/2 -translate-y-1/2"
          />
          <input
            type="text"
            placeholder="Search by station, IMEI, slot, or battery ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full py-2 pl-10 pr-4 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={issueFilter}
          onChange={(e) => setIssueFilter(e.target.value as IssueFilter)}
          className="px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All stations</option>
          <option value="issues">Only stations with issues</option>
          <option value="rentable">Only stations with rentable batteries</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <FontAwesomeIcon
            icon={faSpinner}
            className="text-3xl text-blue-500 animate-spin"
          />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="p-4 mb-6 text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!loading && !error && filteredStations.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-lg shadow dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-300">
            No stations matched your current filters.
          </p>
        </div>
      ) : null}

      <div className="space-y-6">
        {filteredStations.map((station) => (
          <div
            key={station.imei}
            className="overflow-hidden bg-white rounded-xl shadow dark:bg-gray-800"
          >
            <div className="p-5 border-b dark:border-gray-700">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FontAwesomeIcon
                      icon={faWarehouse}
                      className="text-blue-500"
                    />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {station.name}
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                        station.success && station.station_status === "Online"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}
                    >
                      {station.station_status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    IMEI: <span className="font-mono">{station.imei}</span> ·{" "}
                    {station.location}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Last fetched: {formatTime(station.fetchedAt)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-xs text-green-700 dark:text-green-300">Rentable</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-200">
                      {station.rentableCount}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">Low</p>
                    <p className="text-lg font-bold text-yellow-700 dark:text-yellow-200">
                      {station.lowBatteryCount}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <p className="text-xs text-red-700 dark:text-red-300">Problem</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-200">
                      {station.problemCount}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/20">
                    <p className="text-xs text-slate-600 dark:text-slate-300">Offline</p>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-100">
                      {station.offlineCount}
                    </p>
                  </div>
                </div>
              </div>

              {station.error ? (
                <div className="p-3 mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {station.error}
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Slot
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Battery ID
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Level
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      SoH
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Lock
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Battery status
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Slot status
                    </th>
                    <th className="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-300">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {station.batteries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                      >
                        No live battery rows returned for this station.
                      </td>
                    </tr>
                  ) : (
                    station.batteries.map((battery) => (
                      <tr
                        key={`${station.imei}-${battery.slot_id}-${battery.battery_id || "empty"}`}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center justify-center w-8 h-8 text-sm font-bold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            {battery.slot_id || "--"}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm text-gray-700 dark:text-gray-200">
                          {battery.battery_id || "--"}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
                          {battery.battery_capacity ?? "--"}%
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
                          {battery.battery_soh ?? "--"}%
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
                          {battery.lock_status === "1" ? "Online" : "Offline"}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
                          {battery.battery_status || "--"}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
                          {battery.slot_status || "--"}
                        </td>
                        <td className="px-4 py-4">
                          {battery.rentable ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-300">
                              <FontAwesomeIcon icon={faBolt} className="mr-1" />
                              Rentable
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded-full dark:bg-red-900/30 dark:text-red-300">
                              <FontAwesomeIcon
                                icon={faExclamationTriangle}
                                className="mr-1"
                              />
                              {battery.issue || "Not rentable"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
