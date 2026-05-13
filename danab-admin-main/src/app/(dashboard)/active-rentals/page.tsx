"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBatteryThreeQuarters,
  faChevronDown,
  faChevronUp,
  faClock,
  faExclamationTriangle,
  faMapMarkerAlt,
  faPhone,
  faSync,
} from "@fortawesome/free-solid-svg-icons";

import { apiService } from "@/lib/api";
import { normalizeBatteryId } from "@/lib/batteryId";
import { getUserRole, ROLES } from "@/lib/utils/permissions";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLanguageStore } from "@/stores/useLanguageStore";

const OVERDUE_HOURS = 5;

function formatTimestamp(timestamp: any) {
  if (!timestamp?._seconds) return "Unknown";

  return new Date(timestamp._seconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneNumber(phone: string) {
  if (!phone) return "-";

  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 9) {
    return `+252 ${cleaned}`;
  }

  return phone;
}

function parseSomaliaDateBoundary(dateValue: string, endOfDay = false) {
  const trimmed = dateValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const parsed = new Date(`${trimmed}T${time}+03:00`);
  const timestamp = parsed.getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function getTimestampMillis(timestamp: any) {
  if (!timestamp) return null;

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  if (typeof timestamp._seconds === "number") {
    const nanoseconds =
      typeof timestamp._nanoseconds === "number" ? timestamp._nanoseconds : 0;
    return timestamp._seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }

  return null;
}

function formatElapsed(timestamp: any) {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return "Unknown";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);

  return `${hours}h ${minutes}m ago`;
}

function isOverdueRental(timestamp: any) {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return false;

  return Date.now() - millis > OVERDUE_HOURS * 60 * 60 * 1000;
}

function getStatusBadgeClasses(status: "active" | "overdue" | "duplicate") {
  if (status === "overdue") {
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  }

  if (status === "duplicate") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  }

  return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
}

export default function ActiveRentalsPage() {
  const t = useLanguageStore((s) => s.t);
  const user = useAuthStore((s) => s.user);
  const userRole = getUserRole(user);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [batteryHistoryById, setBatteryHistoryById] = useState<
    Record<string, any[]>
  >({});
  const [batteryHistoryLoading, setBatteryHistoryLoading] = useState<
    Record<string, boolean>
  >({});
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [batteryQuery, setBatteryQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingRentalId, setUpdatingRentalId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const hasServerFilters =
    phoneQuery.trim().length > 0 ||
    batteryQuery.trim().length > 0 ||
    startDate.trim().length > 0 ||
    endDate.trim().length > 0 ||
    stationFilter !== "all";

  const hasAnyFilters = hasServerFilters || viewFilter !== "all";

  const fetchActiveRentals = async (fresh = false) => {
    const requestId = ++requestIdRef.current;

    try {
      setLoading(true);
      setError("");

      const txRes = await apiService.getTransactionHistory({
        fresh: fresh || hasServerFilters,
        phone: phoneQuery,
        battery: batteryQuery,
        station: stationFilter,
        startDate,
        endDate,
        status: "rented",
      });

      if (requestId !== requestIdRef.current) return;

      setTransactions(txRes.data || []);
      setExpandedId(null);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message || "Failed to fetch active rentals");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchBatteryHistory = async (batteryId: string) => {
    const normalizedBatteryId = normalizeBatteryId(batteryId);
    if (!normalizedBatteryId) return;

    if (batteryHistoryById[normalizedBatteryId] || batteryHistoryLoading[normalizedBatteryId]) {
      return;
    }

    setBatteryHistoryLoading((current) => ({
      ...current,
      [normalizedBatteryId]: true,
    }));

    try {
      const response = await apiService.getTransactionHistory({
        fresh: true,
        battery: normalizedBatteryId,
        status: "all",
      });

      setBatteryHistoryById((current) => ({
        ...current,
        [normalizedBatteryId]: response.data || [],
      }));
    } catch (error) {
      console.error(
        `Failed to fetch battery history for ${normalizedBatteryId}:`,
        error,
      );
      setBatteryHistoryById((current) => ({
        ...current,
        [normalizedBatteryId]: [],
      }));
    } finally {
      setBatteryHistoryLoading((current) => ({
        ...current,
        [normalizedBatteryId]: false,
      }));
    }
  };

  useEffect(() => {
    const loadStations = async () => {
      try {
        const stRes = await apiService.getStations();
        setStations(stRes.data.stations || stRes.data || []);
      } catch {
        // Keep the page usable even if station metadata fails to load.
      }
    };

    void loadStations();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchActiveRentals();
    }, hasServerFilters ? 250 : 0);

    return () => clearTimeout(timeout);
  }, [
    phoneQuery,
    batteryQuery,
    startDate,
    endDate,
    stationFilter,
    hasServerFilters,
  ]);

  const stationNameByKey = useMemo(() => {
    const map: Record<string, string> = {};

    stations.forEach((station: any) => {
      if (station?.imei) map[station.imei] = station.name || station.imei;
      if (station?.id) map[station.id] = station.name || station.id;
      if (station?.stationCode) {
        map[station.stationCode] = station.name || station.stationCode;
      }
    });

    return map;
  }, [stations]);

  const duplicateCountsByBattery = useMemo(() => {
    const counts = new Map<string, number>();

    transactions.forEach((tx: any) => {
      const batteryId = normalizeBatteryId(tx.battery_id);
      if (!batteryId) return;
      counts.set(batteryId, (counts.get(batteryId) || 0) + 1);
    });

    return counts;
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const startBoundary = parseSomaliaDateBoundary(startDate, false);
    const endBoundary = parseSomaliaDateBoundary(endDate, true);
    const rangeStart =
      startBoundary !== null && endBoundary !== null
        ? Math.min(startBoundary, endBoundary)
        : startBoundary;
    const rangeEnd =
      startBoundary !== null && endBoundary !== null
        ? Math.max(startBoundary, endBoundary)
        : endBoundary;

    return transactions.filter((tx: any) => {
      const timestampMs = getTimestampMillis(tx.timestamp);
      const isOverdue = isOverdueRental(tx.timestamp);
      const duplicateCount =
        duplicateCountsByBattery.get(normalizeBatteryId(tx.battery_id)) || 0;

      if (rangeStart !== null && (timestampMs === null || timestampMs < rangeStart)) {
        return false;
      }

      if (rangeEnd !== null && (timestampMs === null || timestampMs > rangeEnd)) {
        return false;
      }

      if (viewFilter === "overdue" && !isOverdue) {
        return false;
      }

      if (viewFilter === "duplicates" && duplicateCount < 2) {
        return false;
      }

      return true;
    });
  }, [transactions, startDate, endDate, viewFilter, duplicateCountsByBattery]);

  const stationOptions = useMemo(() => {
    const deduped = new Map<string, string>();

    stations.forEach((station: any) => {
      const value = station?.imei || station?.stationCode || station?.id;
      const label =
        station?.name || station?.imei || station?.stationCode || station?.id;

      if (value && label && !deduped.has(value)) {
        deduped.set(value, label);
      }
    });

    return Array.from(deduped.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [stations]);

  const summary = useMemo(() => {
    const duplicateBatteryIds = new Set<string>();
    let overdueCount = 0;

    filteredTransactions.forEach((tx: any) => {
      const batteryId = normalizeBatteryId(tx.battery_id);
      const duplicateCount = duplicateCountsByBattery.get(batteryId) || 0;

      if (duplicateCount > 1 && batteryId) {
        duplicateBatteryIds.add(batteryId);
      }

      if (isOverdueRental(tx.timestamp)) {
        overdueCount++;
      }
    });

    return {
      active: filteredTransactions.length,
      overdue: overdueCount,
      duplicateBatteries: duplicateBatteryIds.size,
    };
  }, [filteredTransactions, duplicateCountsByBattery]);

  const clearFilters = () => {
    setPhoneQuery("");
    setBatteryQuery("");
    setStartDate("");
    setEndDate("");
    setStationFilter("all");
    setViewFilter("all");
  };

  const handleMarkReturned = async (tx: any) => {
    if (!tx?.id) return;

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Mark battery ${tx.battery_id || "-"} for phone ${formatPhoneNumber(
              tx.phoneNumber || "",
            )} as returned?`,
          );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingRentalId(tx.id);
      await apiService.markRentalReturned(
        tx.id,
        `Manually marked returned from Active Rentals by ${user?.username || "admin"}`,
      );

      const normalizedBatteryId = normalizeBatteryId(tx.battery_id);
      setBatteryHistoryById((current) => ({
        ...current,
        [normalizedBatteryId]: [],
      }));

      await fetchActiveRentals(true);
      await fetchBatteryHistory(tx.battery_id || "");
    } catch (error: any) {
      setError(error.message || "Failed to mark rental returned");
    } finally {
      setUpdatingRentalId(null);
    }
  };

  const viewOptions = [
    { value: "all", label: "All Active" },
    { value: "overdue", label: "Overdue Only" },
    { value: "duplicates", label: "Duplicates Only" },
  ];

  return (
    <div className="p-4">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">{t("rentals")}</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Only currently rented batteries, with quick filters for phone,
            battery, station, overdue cases, and duplicate active rows.
          </p>
        </div>

        <button
          onClick={() => void fetchActiveRentals(true)}
          disabled={loading}
          className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faSync} spin={loading} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-100 p-3 text-red-700 dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 mb-3 md:grid-cols-2 xl:grid-cols-6">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Phone
          </label>
          <input
            type="text"
            value={phoneQuery}
            onChange={(e) => setPhoneQuery(e.target.value)}
            placeholder="Phone number"
            className="w-full rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Battery
          </label>
          <input
            type="text"
            value={batteryQuery}
            onChange={(e) => setBatteryQuery(e.target.value)}
            placeholder="Battery ID"
            className="w-full rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Station
          </label>
          <div className="flex items-center rounded-lg border px-3 py-2 dark:bg-gray-700 dark:border-gray-600">
            <FontAwesomeIcon
              icon={faMapMarkerAlt}
              className="mr-2 text-blue-500"
            />
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="w-full bg-transparent outline-none dark:text-white"
            >
              <option value="all">All Stations</option>
              {stationOptions.map((station) => (
                <option key={station.value} value={station.value}>
                  {station.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            From
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            To
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={clearFilters}
          disabled={!hasAnyFilters}
            className="w-full rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-lg border bg-gray-50 p-1 dark:bg-gray-800 dark:border-gray-600">
        <div className="flex flex-wrap gap-2">
          {viewOptions.map((option) => {
            const active = viewFilter === option.value;

            return (
              <label
                key={option.value}
                className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-center text-sm font-medium transition ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="active-rental-view"
                  value={option.value}
                  checked={active}
                  onChange={(e) => setViewFilter(e.target.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Active Rows
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.active}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Overdue
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">
            {summary.overdue}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Duplicate Batteries
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.duplicateBatteries}
          </div>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {hasAnyFilters
          ? `Found ${filteredTransactions.length} matching active rentals`
          : `Showing ${filteredTransactions.length} active rentals`}
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Station
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Battery / Slot
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Age
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Flags
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No active rentals found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx: any) => {
                  const isExpanded = expandedId === tx.id;
                  const normalizedBatteryId = normalizeBatteryId(tx.battery_id);
                  const duplicateCount =
                    duplicateCountsByBattery.get(normalizedBatteryId) || 0;
                  const overdue = isOverdueRental(tx.timestamp);
                  const batteryHistory =
                    batteryHistoryById[normalizedBatteryId] || [];
                  const isBatteryHistoryLoading =
                    batteryHistoryLoading[normalizedBatteryId] || false;

                  return (
                    <Fragment key={tx.id}>
                      <tr className="align-top hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {formatTimestamp(tx.timestamp)}
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          <div className="flex items-center gap-2">
                            <FontAwesomeIcon
                              icon={faPhone}
                              className="text-blue-500"
                            />
                            <span>{formatPhoneNumber(tx.phoneNumber)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          {stationNameByKey[tx.imei] ||
                            tx.stationName ||
                            tx.stationCode ||
                            tx.imei ||
                            "-"}
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          <div className="flex items-center gap-2 font-medium">
                            <FontAwesomeIcon
                              icon={faBatteryThreeQuarters}
                              className="text-blue-500"
                            />
                            <span>{tx.battery_id || "-"}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Slot {tx.slot_id || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          <div className="flex items-center gap-2">
                            <FontAwesomeIcon
                              icon={faClock}
                              className="text-green-500"
                            />
                            <span>{formatElapsed(tx.timestamp)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${getStatusBadgeClasses(
                                overdue ? "overdue" : "active",
                              )}`}
                            >
                              {overdue ? "Overdue" : "Active"}
                            </span>
                            {duplicateCount > 1 && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${getStatusBadgeClasses(
                                  "duplicate",
                                )}`}
                              >
                                Duplicate x{duplicateCount}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              if (!isExpanded) {
                                void fetchBatteryHistory(tx.battery_id || "");
                              }
                              setExpandedId(isExpanded ? null : tx.id);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            {isExpanded ? "Hide" : "View"}
                            <FontAwesomeIcon
                              icon={isExpanded ? faChevronUp : faChevronDown}
                            />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50 dark:bg-gray-900/40">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Requested Phone (Immutable)
                                </div>
                                <div className="mt-1 text-sm dark:text-white">
                                  {formatPhoneNumber(
                                    tx.requestedPhoneNumber || tx.phoneNumber,
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi Account
                                </div>
                                <div className="mt-1 text-sm dark:text-white">
                                  {tx.waafiAccountNo || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi State
                                </div>
                                <div className="mt-1 text-sm dark:text-white">
                                  {tx.waafiState || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Firestore ID
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.id || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi Response Code
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.waafiResponseCode || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Station IMEI
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.imei || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi Response Message
                                </div>
                                <div className="mt-1 text-sm dark:text-white">
                                  {tx.waafiResponseMsg || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Unlock Status
                                </div>
                                <div className="mt-1 text-sm dark:text-white">
                                  {tx.unlockStatus || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi Amount
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.waafiTxAmount || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi Transaction ID
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.transactionId || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Issuer Transaction ID
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.issuerTransactionId || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Reference ID
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.referenceId || "-"}
                                </div>
                              </div>
                            </div>
                            {duplicateCount > 1 && (
                              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                                <div className="flex items-center gap-2 font-medium">
                                  <FontAwesomeIcon icon={faExclamationTriangle} />
                                  <span>
                                    This battery currently has {duplicateCount} active rental rows.
                                  </span>
                                </div>
                              </div>
                            )}

                            {userRole === ROLES.ADMIN && (
                              <div className="mt-4">
                                <button
                                  onClick={() => void handleMarkReturned(tx)}
                                  disabled={updatingRentalId === tx.id}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {updatingRentalId === tx.id
                                    ? "Marking..."
                                    : "Mark Returned"}
                                </button>
                              </div>
                            )}

                            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-900/20">
                              <div className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                                All rows for this battery
                              </div>
                              {isBatteryHistoryLoading ? (
                                <div className="text-sm text-blue-800 dark:text-blue-200">
                                  Loading battery rows...
                                </div>
                              ) : batteryHistory.length === 0 ? (
                                <div className="text-sm text-blue-800 dark:text-blue-200">
                                  No additional rows found
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[720px] text-sm">
                                    <thead>
                                      <tr className="border-b border-blue-200 dark:border-blue-900/50">
                                        <th className="px-2 py-2 text-left font-medium text-blue-900 dark:text-blue-100">
                                          Date
                                        </th>
                                        <th className="px-2 py-2 text-left font-medium text-blue-900 dark:text-blue-100">
                                          Phone
                                        </th>
                                        <th className="px-2 py-2 text-left font-medium text-blue-900 dark:text-blue-100">
                                          Status
                                        </th>
                                        <th className="px-2 py-2 text-left font-medium text-blue-900 dark:text-blue-100">
                                          Slot
                                        </th>
                                        <th className="px-2 py-2 text-left font-medium text-blue-900 dark:text-blue-100">
                                          Firestore ID
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {batteryHistory.map((row: any) => (
                                        <tr
                                          key={`battery-history-${row.id}`}
                                          className="border-b border-blue-100 dark:border-blue-900/30"
                                        >
                                          <td className="px-2 py-2 text-blue-900 dark:text-blue-100">
                                            {formatTimestamp(row.timestamp)}
                                          </td>
                                          <td className="px-2 py-2 text-blue-900 dark:text-blue-100">
                                            {formatPhoneNumber(row.phoneNumber)}
                                          </td>
                                          <td className="px-2 py-2">
                                            <span
                                              className={`rounded-full px-2 py-0.5 text-xs ${row.status === "returned" || row.status === "completed"
                                                ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                                                : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                              }`}
                                            >
                                              {row.status || "Unknown"}
                                            </span>
                                          </td>
                                          <td className="px-2 py-2 text-blue-900 dark:text-blue-100">
                                            {row.slot_id || "-"}
                                          </td>
                                          <td className="px-2 py-2 font-mono text-xs text-blue-900 dark:text-blue-100">
                                            {row.id || "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
