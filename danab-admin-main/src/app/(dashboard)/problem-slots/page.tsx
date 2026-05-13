"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faSearch,
  faSpinner,
  faCheck,
  faUndo,
  faTrash,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";
import { apiService, apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import { getUserRole, ROLES } from "@/lib/utils/permissions";
import CustomAlert from "@/components/CustomAlert";

export default function ProblemSlotsPage() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("open");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const userRole = getUserRole(user);
  const isAdmin = userRole === ROLES.ADMIN;

  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", type: "success" });

  const showAlert = (
    message: string,
    type: "success" | "error" | "warning" | "info",
  ) => {
    setAlert({ open: true, message, type });
  };

  useEffect(() => {
    fetchProblemSlots();
  }, []);

  const fetchProblemSlots = async (force = false) => {
    try {
      setLoading(true);
      if (force) {
        apiService.invalidateReadCache(["/api/problem-slots"]);
        const response = await apiClient.get("/api/problem-slots?fresh=1");
        setSlots(response.data || []);
      } else {
        const response = await apiService.getProblemSlots();
        setSlots(response.data || []);
      }
      setError(null);
    } catch (err: any) {
      setError("Failed to fetch problem slots");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string, resolved: boolean) => {
    try {
      setActionLoading(id);
      await apiService.resolveProblemSlot(id, resolved);
      await fetchProblemSlots(true);
      showAlert(
        resolved ? "Slot marked as resolved" : "Slot marked as unresolved",
        "success",
      );
    } catch (err: any) {
      showAlert(
        err.response?.data?.error || "Failed to update slot",
        "error",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setActionLoading(id);
      await apiService.deleteProblemSlot(id);
      await fetchProblemSlots(true);
      showAlert("Problem slot deleted", "success");
    } catch (err: any) {
      showAlert(
        err.response?.data?.error || "Failed to delete slot",
        "error",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const filteredSlots = slots.filter((slot: any) => {
    const matchesSearch =
      slot.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      slot.slot_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      slot.battery_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      slot.reason?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterResolved === "open") return matchesSearch && !slot.resolved;
    if (filterResolved === "resolved") return matchesSearch && slot.resolved;
    return matchesSearch;
  });

  const openCount = slots.filter((s: any) => !s.resolved).length;
  const resolvedCount = slots.filter((s: any) => s.resolved).length;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp._seconds
      ? new Date(timestamp._seconds * 1000)
      : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-4 md:p-6">
      {alert.open && (
        <CustomAlert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert({ ...alert, open: false })}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div className="flex items-center mb-4 md:mb-0">
          <FontAwesomeIcon
            icon={faExclamationTriangle}
            className="text-2xl text-orange-600 dark:text-orange-400 mr-3"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Problem Slots
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Slots that failed to eject batteries — excluded from rentals until resolved
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="flex items-center">
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="text-orange-600 dark:text-orange-400 mr-3"
            />
            <div>
              <p className="text-sm text-orange-600 dark:text-orange-400">
                Open Issues
              </p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                {openCount}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center">
            <FontAwesomeIcon
              icon={faCheck}
              className="text-green-600 dark:text-green-400 mr-3"
            />
            <div>
              <p className="text-sm text-green-600 dark:text-green-400">
                Resolved
              </p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {resolvedCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by IMEI, slot, battery ID, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center space-x-2">
          <FontAwesomeIcon
            icon={faFilter}
            className="text-gray-400"
          />
          <select
            value={filterResolved}
            onChange={(e) => setFilterResolved(e.target.value as any)}
            className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="open">Open Issues</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <FontAwesomeIcon
            icon={faSpinner}
            className="text-3xl text-gray-400 animate-spin"
          />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-12 text-red-600 dark:text-red-400">
          <p>{error}</p>
          <button
            onClick={() => fetchProblemSlots()}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Problem Slots Table */}
      {!loading && !error && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Station (IMEI)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Slot
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Battery ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredSlots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      {searchTerm
                        ? "No matching problem slots found"
                        : filterResolved === "open"
                          ? "No open problem slots"
                          : "No problem slots found"}
                    </td>
                  </tr>
                ) : (
                  filteredSlots.map((slot: any) => (
                    <tr
                      key={slot.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-gray-900 dark:text-white">
                          {slot.imei}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 font-bold text-sm">
                          {slot.slot_id}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                          {slot.battery_id || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">
                        {slot.reason || "-"}
                      </td>
                      <td className="px-4 py-4">
                        {slot.resolved ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(slot.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {slot.resolved ? (
                            <button
                              onClick={() => handleResolve(slot.id, false)}
                              disabled={actionLoading === slot.id}
                              className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 p-2 disabled:opacity-50"
                              title="Mark as unresolved"
                            >
                              {actionLoading === slot.id ? (
                                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faUndo} />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleResolve(slot.id, true)}
                              disabled={actionLoading === slot.id}
                              className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 p-2 disabled:opacity-50"
                              title="Mark as resolved"
                            >
                              {actionLoading === slot.id ? (
                                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faCheck} />
                              )}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(slot.id)}
                              disabled={actionLoading === slot.id}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-2 disabled:opacity-50"
                              title="Delete record"
                            >
                              {actionLoading === slot.id ? (
                                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faTrash} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
