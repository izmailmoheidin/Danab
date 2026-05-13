"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faSync,
} from "@fortawesome/free-solid-svg-icons";

import { apiService } from "@/lib/api";
import { normalizeBatteryId } from "@/lib/batteryId";
import { useLanguageStore } from "@/stores/useLanguageStore";

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

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    completed:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    rented: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    returned:
      "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  };

  return map[status?.toLowerCase()] || map.returned;
}

function isActiveRentalStatus(status: string) {
  const normalized = String(status || "").toLowerCase();
  return normalized !== "returned" && normalized !== "completed";
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

export default function TransactionsPage() {
  const t = useLanguageStore((s) => s.t);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [batteryRows, setBatteryRows] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [batteryRowsLoading, setBatteryRowsLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [batteryQuery, setBatteryQuery] = useState("");
  const [waafiQuery, setWaafiQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const hasActiveFilters =
    phoneQuery.trim().length > 0 ||
    batteryQuery.trim().length > 0 ||
    waafiQuery.trim().length > 0 ||
    startDate.trim().length > 0 ||
    endDate.trim().length > 0 ||
    statusFilter !== "all" ||
    stationFilter !== "all";

  const fetchTransactions = async (fresh = false) => {
    const requestId = ++requestIdRef.current;

    try {
      setLoading(true);
      setError("");

      const txRes = await apiService.getTransactionHistory({
        fresh: fresh || hasActiveFilters,
        phone: phoneQuery,
        battery: batteryQuery,
        waafi: waafiQuery,
        startDate,
        endDate,
        station: stationFilter,
        status: statusFilter,
      });

      if (requestId !== requestIdRef.current) return;

      setTransactions(txRes.data || []);
      setExpandedId(null);

      const normalizedBatteryQuery = batteryQuery.trim();
      if (normalizedBatteryQuery) {
        setBatteryRowsLoading(true);

        const batteryRowsRes = await apiService.getTransactionHistory({
          fresh: true,
          battery: normalizedBatteryQuery,
          status: "all",
        });

        if (requestId !== requestIdRef.current) return;

        setBatteryRows(batteryRowsRes.data || []);
      } else {
        setBatteryRows([]);
      }
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message || "Failed to fetch transaction history");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setBatteryRowsLoading(false);
      }
    }
  };

  useEffect(() => {
    const loadStations = async () => {
      try {
        const stRes = await apiService.getStations();
        setStations(stRes.data.stations || stRes.data || []);
      } catch {
        // Keep transaction screen usable even if station names fail to load.
      }
    };

    void loadStations();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchTransactions();
    }, hasActiveFilters ? 250 : 0);

    return () => clearTimeout(timeout);
  }, [
    phoneQuery,
    batteryQuery,
    waafiQuery,
    startDate,
    endDate,
    stationFilter,
    statusFilter,
    hasActiveFilters,
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

  const filteredTransactions = useMemo(() => {
    const phoneSearch = phoneQuery.replace(/\D/g, "");
    const batterySearch = normalizeBatteryId(batteryQuery);
    const waafiSearch = waafiQuery.trim().toLowerCase();
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
      const normalizedStatus = tx.status?.toLowerCase() || "";
      const normalizedStation =
        tx.imei || tx.stationCode || tx.stationName || "";
      const txTimestampMs = getTimestampMillis(tx.timestamp);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "returned"
            ? normalizedStatus === "returned" || normalizedStatus === "completed"
            : normalizedStatus !== "returned" &&
              normalizedStatus !== "completed";
      const matchesStation =
        stationFilter === "all" || normalizedStation === stationFilter;

      if (!matchesStatus || !matchesStation) {
        return false;
      }

      const txPhone = String(tx.phoneNumber || "").replace(/\D/g, "");
      const txBattery = normalizeBatteryId(tx.battery_id);
      const txWaafiValues = [
        tx.transactionId,
        tx.issuerTransactionId,
        tx.referenceId,
        tx.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (phoneSearch && !txPhone.includes(phoneSearch)) {
        return false;
      }

      if (batterySearch && !txBattery.includes(batterySearch)) {
        return false;
      }

      if (waafiSearch && !txWaafiValues.includes(waafiSearch)) {
        return false;
      }

      if (rangeStart !== null && (txTimestampMs === null || txTimestampMs < rangeStart)) {
        return false;
      }

      if (rangeEnd !== null && (txTimestampMs === null || txTimestampMs > rangeEnd)) {
        return false;
      }

      return true;
    });
  }, [
    transactions,
    phoneQuery,
    batteryQuery,
    waafiQuery,
    startDate,
    endDate,
    statusFilter,
    stationFilter,
  ]);

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

  const batteryRowSummary = useMemo(() => {
    const activeRows = batteryRows.filter((tx: any) =>
      isActiveRentalStatus(tx.status),
    );

    return {
      total: batteryRows.length,
      active: activeRows.length,
      returned: batteryRows.length - activeRows.length,
    };
  }, [batteryRows]);

  const clearFilters = () => {
    setPhoneQuery("");
    setBatteryQuery("");
    setWaafiQuery("");
    setStartDate("");
    setEndDate("");
    setStatusFilter("all");
    setStationFilter("all");
  };

  const statusOptions = [
    { value: "all", label: "All" },
    { value: "rented", label: "Rented" },
    { value: "returned", label: "Returned" },
  ];

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">
            {t("transactions")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Full transaction history with live Firestore search for phone,
            battery, station, and Waafi IDs
          </p>
        </div>

        <button
          onClick={() => void fetchTransactions(true)}
          disabled={loading}
          className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faSync} spin={loading} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 mb-3 md:grid-cols-2 xl:grid-cols-7">
        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Phone
          </label>
          <input
            type="text"
            value={phoneQuery}
            onChange={(e) => setPhoneQuery(e.target.value)}
            placeholder="Phone number"
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Battery
          </label>
          <input
            type="text"
            value={batteryQuery}
            onChange={(e) => setBatteryQuery(e.target.value)}
            placeholder="Battery ID"
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Waafi
          </label>
          <input
            type="text"
            value={waafiQuery}
            onChange={(e) => setWaafiQuery(e.target.value)}
            placeholder="TX / Issuer / Ref"
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Station
          </label>
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Stations</option>
            {stationOptions.map((station) => (
              <option key={station.value} value={station.value}>
                {station.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            From
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            To
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Status
          </label>
          <div className="flex items-center gap-2 p-1 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-600">
          {statusOptions.map((option) => {
            const active = statusFilter === option.value;

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
                  name="transaction-status"
                  value={option.value}
                  checked={active}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {hasActiveFilters
            ? `Found ${filteredTransactions.length} matching transactions from Firestore`
            : `Showing ${filteredTransactions.length} transactions`}
        </div>
        <button
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 dark:text-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Clear Filters
        </button>
      </div>

      {batteryQuery.trim() && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                All rows for battery {batteryQuery.trim().toUpperCase()}
              </div>
              <div className="text-sm text-amber-800 dark:text-amber-200">
                This ignores the main status filter so you can inspect every
                Firestore row for this battery.
              </div>
            </div>
            <div className="text-sm text-amber-900 dark:text-amber-100">
              Total: {batteryRowSummary.total} | Active: {batteryRowSummary.active} | Returned: {batteryRowSummary.returned}
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-amber-200 dark:border-amber-900">
                  <th className="px-3 py-2 text-left font-medium text-amber-900 dark:text-amber-100">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-amber-900 dark:text-amber-100">
                    Phone
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-amber-900 dark:text-amber-100">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-amber-900 dark:text-amber-100">
                    Slot
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-amber-900 dark:text-amber-100">
                    Firestore ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {batteryRowsLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center text-amber-800 dark:text-amber-200"
                    >
                      Loading battery rows...
                    </td>
                  </tr>
                ) : batteryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center text-amber-800 dark:text-amber-200"
                    >
                      No rows found for this battery
                    </td>
                  </tr>
                ) : (
                  batteryRows.map((tx: any) => (
                    <tr
                      key={`battery-row-${tx.id}`}
                      className="border-b border-amber-100 dark:border-amber-900/60"
                    >
                      <td className="px-3 py-2 text-amber-900 dark:text-amber-100">
                        {formatTimestamp(tx.timestamp)}
                      </td>
                      <td className="px-3 py-2 text-amber-900 dark:text-amber-100">
                        {formatPhoneNumber(tx.phoneNumber)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadge(
                            tx.status,
                          )}`}
                        >
                          {tx.status || "Unknown"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-amber-900 dark:text-amber-100">
                        {tx.slot_id || "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-amber-900 dark:text-amber-100">
                        {tx.id || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Station
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Battery / Slot
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <div className="w-6 h-6 mx-auto border-b-2 border-blue-600 rounded-full animate-spin"></div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx: any) => {
                  const isExpanded = expandedId === tx.id;

                  return (
                    <Fragment key={tx.id}>
                      <tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 align-top"
                      >
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {formatTimestamp(tx.timestamp)}
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          {formatPhoneNumber(tx.phoneNumber)}
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          {stationNameByKey[tx.imei] ||
                            tx.stationName ||
                            tx.stationCode ||
                            tx.imei ||
                            "-"}
                        </td>
                        <td className="px-4 py-3 dark:text-white">
                          <div className="font-medium">
                            {tx.battery_id || "-"}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Slot {tx.slot_id || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium dark:text-white">
                          ${Number(tx.amount || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadge(
                              tx.status,
                            )}`}
                          >
                            {tx.status || "Unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              setExpandedId(isExpanded ? null : tx.id)
                            }
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
                        <tr key={`${tx.id}-details`} className="bg-gray-50 dark:bg-gray-900/40">
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
                                  Waafi Transaction ID
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.transactionId || "-"}
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
                                  Waafi Error Code
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.waafiErrorCode || "-"}
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
                                  Issuer Transaction ID
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.issuerTransactionId || "-"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Waafi Amount
                                </div>
                                <div className="mt-1 text-sm dark:text-white">
                                  {tx.waafiTxAmount || "-"}
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
                                  Station IMEI
                                </div>
                                <div className="mt-1 break-all font-mono text-sm dark:text-white">
                                  {tx.imei || "-"}
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
