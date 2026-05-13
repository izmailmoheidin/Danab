"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMapMarkerAlt,
  faSearch,
  faTimes,
  faCheckCircle,
  faExclamationTriangle,
  faPlug,
  faLock,
  faBatteryFull,
  faLockOpen,
  faPhone,
  faClock,
  faSyncAlt,
} from "@fortawesome/free-solid-svg-icons";
import { apiService } from "@/lib/api";
import { normalizeBatteryId } from "@/lib/batteryId";

const timeAgo = (seconds: number) => {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}h ${m}m ${s}s ago`;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?._seconds === "number") {
    return new Date(value._seconds * 1000);
  }
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const formatLastUpdated = (value: any) => {
  const date = toDate(value);
  if (!date) return null;

  return {
    absolute: date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    relative: timeAgo(Math.floor(date.getTime() / 1000)),
  };
};

const getBatteryColor = (level: number) =>
  level >= 70 ? "bg-green-400" : level >= 40 ? "bg-yellow-400" : "bg-red-500";

const getStatusInfo = (slot: any) => {
  const status = slot.status?.toLowerCase();
  const isMissing = status === "empty";
  const isOverdue = status === "overdue";
  const isLowBattery = status === "low battery";
  const isOccupied = !isOverdue && (status === "rented" || slot.rented);
  const isAvailable = status === "online" && !slot.rented;

  let statusText = "Unknown";
  if (isAvailable) statusText = "Available";
  if (isLowBattery) statusText = "Low Battery";
  if (isOccupied) statusText = "Occupied";
  if (isOverdue) statusText = "Overdue";
  if (isMissing) statusText = "Missing";

  const badgeClass = `px-2 py-1 text-xs font-semibold rounded-full border ${
    isAvailable
      ? "text-green-700 bg-green-100 border-green-400"
      : isLowBattery
        ? "text-amber-700 bg-amber-100 border-amber-400"
      : isOverdue
        ? "text-red-700 bg-red-100 border-red-400"
        : isOccupied
        ? "text-blue-700 bg-blue-100 border-blue-400"
      : "text-red-700 bg-red-100 border-red-400"
  }`;

  const buttonClass = `w-full py-2 font-semibold rounded-lg flex justify-center items-center gap-2 transition ${
    isAvailable
      ? "bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
      : isLowBattery
        ? "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700"
      : isOverdue
        ? "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
        : isOccupied
        ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
      : "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
  }`;

  const borderClass = isAvailable
    ? "border-green-400"
    : isLowBattery
      ? "border-amber-400"
    : isOverdue
      ? "border-red-400"
      : isOccupied
      ? "border-blue-400"
    : "border-red-400";

  const icon = isAvailable
    ? faLock
    : isLowBattery
      ? faBatteryFull
    : isOverdue
      ? faExclamationTriangle
      : isOccupied
      ? faLockOpen
    : faExclamationTriangle;

  return { statusText, badgeClass, buttonClass, borderClass, icon };
};

const getActiveRenters = (slot: any) => {
  if (Array.isArray(slot.activeRentals) && slot.activeRentals.length > 0) {
    return slot.activeRentals;
  }

  if (!slot.phoneNumber) {
    return [];
  }

  return [
    {
      id: slot.rentalId || null,
      phoneNumber: slot.phoneNumber,
      rentedAt: slot.rentedAt || null,
      amount: slot.amount || 0,
      imei: slot.imei || null,
      unlockStatus: slot.unlockStatus || null,
    },
  ];
};

function SlotCard({ slot }: { slot: any }) {
  const { statusText, badgeClass, buttonClass, borderClass, icon } =
    getStatusInfo(slot);
  const activeRenters = getActiveRenters(slot);
  const hasDuplicateRentals = activeRenters.length > 1;

  return (
    <div
      className={`flex flex-col justify-between p-4 rounded-xl shadow min-h-[220px] bg-white dark:bg-gray-900 border-2 ${borderClass}`}
    >
      <div className="flex justify-between mb-2">
        <div className="font-bold dark:text-white">#{slot.slot_id}</div>
        <div className={`flex items-center ${badgeClass}`}>
          {statusText === "Available" && (
            <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
          )}
          {statusText === "Low Battery" && (
            <FontAwesomeIcon icon={faBatteryFull} className="text-amber-500" />
          )}
          {statusText === "Occupied" && (
            <FontAwesomeIcon icon={faLock} className="text-blue-500" />
          )}
          {statusText !== "Available" &&
            statusText !== "Occupied" &&
            statusText !== "Low Battery" && (
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="text-red-500"
            />
          )}
          <span className="ml-1">{statusText}</span>
        </div>
      </div>

      <div className="flex items-center mb-1 text-sm dark:text-white">
        <FontAwesomeIcon icon={faBatteryFull} className="mr-1 text-gray-400" />
        Battery ID:{" "}
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          {slot.battery_id}
        </span>
      </div>

      <div className="mb-2">
        <div className="flex justify-between mb-1 text-xs dark:text-white">
          <span>Battery Level</span>
          <span>
            {slot.level !== null && slot.level !== undefined
              ? `${Math.min(Math.max(slot.level, 0), 100)}%`
              : "N/A"}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full dark:bg-gray-700">
          {slot.level !== null && slot.level !== undefined && (
            <div
              className={`h-2 rounded-full ${getBatteryColor(slot.level)}`}
              style={{ width: `${Math.min(Math.max(slot.level, 0), 100)}%` }}
            />
          )}
        </div>
      </div>

      <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        Status: {statusText}
        {statusText === "Low Battery" && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            Below 60%, blocked for new rentals
          </div>
        )}
        {(statusText === "Occupied" ||
          statusText === "Overdue" ||
          statusText === "Missing") &&
          activeRenters.length > 0 && (
            <div className="mt-2 space-y-1 text-xs">
              {hasDuplicateRentals && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-2 py-1 font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  <span>Duplicate active rentals: {activeRenters.length}</span>
                </div>
              )}
              {!hasDuplicateRentals && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
                  Active rentals: {activeRenters.length}
                </div>
              )}
              {activeRenters.map((renter: any, index: number) => (
                <div
                  key={renter.id || `${slot.battery_id || slot.slot_id}-${index}`}
                  className="space-y-1 rounded-lg border border-blue-100 bg-blue-50 p-2 dark:border-blue-900/50 dark:bg-blue-900/20"
                >
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <FontAwesomeIcon icon={faPhone} className="text-sm" />
                    <span>{renter.phoneNumber || "-"}</span>
                  </div>
                  {renter.rentedAt?._seconds && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <FontAwesomeIcon icon={faClock} className="text-sm" />
                      <span>Rented: {timeAgo(renter.rentedAt._seconds)}</span>
                    </div>
                  )}
                  {renter.id && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      Rental ID: {renter.id}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>

      <button className={buttonClass}>
        <FontAwesomeIcon icon={icon} /> {statusText}
      </button>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center p-3 text-center border rounded-lg shadow bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 dark:border-gray-700">
      <div>
        <FontAwesomeIcon icon={icon} className={color} />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-bold dark:text-white">{value}</div>
    </div>
  );
}

export default function SlotsPage() {
  const [stations, setStations] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [slots, setSlots] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    rented: 0,
    overdue: 0,
  });
  const [stationInfo, setStationInfo] = useState<any>(null);

  const loadStations = async () => {
    try {
      const response = await apiService.getStations();
      const stationsList = response.data.stations || [];
      setStations(stationsList);
      if (stationsList.length) setSelected(stationsList[0].id);
    } catch {
      setError("Failed to load stations");
    }
  };

  const requestIdRef = useRef(0);

  const loadSlots = useCallback(async (forceFresh = false) => {
    if (!selected) return;

    // Immediately clear old data so stale info never shows
    setSlots([]);
    setStats({ total: 0, available: 0, rented: 0, overdue: 0 });
    setStationInfo(null);
    setError("");
    setLoading(true);

    // Track this request to prevent race conditions
    const currentRequestId = ++requestIdRef.current;

    try {
      const response = await apiService.getStationStats(selected, forceFresh);

      // If user switched station while we were fetching, discard this response
      if (currentRequestId !== requestIdRef.current) return;

      const station = response.data.station;

      if (!station) {
        setError("Station data not found");
        setSlots([]);
        setStats({ total: 0, available: 0, rented: 0, overdue: 0 });
        setStationInfo(null);
      } else if (station.station_status === "Offline") {
        setError(`Station "${station.name}" is currently offline`);
        setSlots([]);
        setStats({
          total: station.totalSlots || 0,
          available: 0,
          rented: 0,
          overdue: 0,
        });
        setStationInfo(station);
      } else {
        setSlots(Array.isArray(station.batteries) ? station.batteries : []);
        setStats({
          total: station.totalSlots || 0,
          available: station.availableCount || 0,
          rented: station.rentedCount || 0,
          overdue: station.overdueCount || 0,
        });
        setStationInfo(station);
      }
    } catch {
      if (currentRequestId === requestIdRef.current) {
        setError("Failed to load slots");
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [selected]);

  useEffect(() => {
    loadStations();
  }, []);
  useEffect(() => {
    if (selected) void loadSlots(true);
  }, [selected, loadSlots]);

  const filtered = slots.filter(
    (s: any) =>
      !search ||
      s.slot_id?.toString().includes(search) ||
      normalizeBatteryId(s.battery_id).includes(normalizeBatteryId(search)) ||
      s.status?.toLowerCase().includes(search.toLowerCase()),
  );

  const statCards = [
    {
      label: "Total Slots",
      value: stats.total,
      icon: faPlug,
      color: "text-blue-500",
    },
    {
      label: "Available",
      value: stats.available,
      icon: faCheckCircle,
      color: "text-green-500",
    },
    {
      label: "Occupied",
      value: stats.rented,
      icon: faLock,
      color: "text-orange-500",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      icon: faExclamationTriangle,
      color: "text-red-500",
    },
  ];

  const lastUpdated = formatLastUpdated(stationInfo?.timestamp);

  return (
    <div className="max-w-3xl p-4 mx-auto">
      <h3 className="mb-1 text-2xl font-bold dark:text-white">
        Slot Management
      </h3>
      {stationInfo && (
        <p className="mb-4 text-gray-500 dark:text-gray-400">
          Station:{" "}
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {stationInfo.name}
          </span>{" "}
          ({stationInfo.location}) – Status:{" "}
          <span
            className={`font-semibold ml-1 ${stationInfo.station_status === "Online" ? "text-green-600" : "text-red-600"}`}
          >
            {stationInfo.station_status}
          </span>
          {lastUpdated && (
            <span className="block mt-2 text-xs text-gray-500 dark:text-gray-400">
              Last updated: {lastUpdated.absolute} ({lastUpdated.relative})
            </span>
          )}
        </p>
      )}

      <div className="flex flex-col gap-2 mb-4 sm:flex-row">
        <div className="flex items-center w-full px-3 py-2 bg-white border rounded-lg sm:w-auto dark:bg-gray-800 dark:border-gray-700">
          <FontAwesomeIcon
            icon={faMapMarkerAlt}
            className="mr-2 text-blue-500"
          />
          <select
            className="w-full bg-transparent outline-none dark:text-white"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {stations.map((st: any) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute text-gray-400 left-3 top-3"
          />
          <input
            type="text"
            placeholder="Search..."
            className="w-full py-2 pl-10 pr-10 border rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute text-gray-400 right-3 top-2 hover:text-red-500"
              onClick={() => setSearch("")}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <button
          onClick={() => void loadSlots(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg shadow hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
        >
          <FontAwesomeIcon icon={faSyncAlt} /> Refresh Now
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            color={stat.color}
          />
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          Loading...
        </div>
      ) : error ? (
        <div className="py-8 text-center text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((s: any) => (
            <SlotCard key={s.slot_id} slot={s} />
          ))}
        </div>
      )}
    </div>
  );
}
