"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faPlus,
  faTrash,
  faSearch,
  faSpinner,
  faTimes,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { apiService, apiClient } from "@/lib/api";
import CustomAlert from "@/components/CustomAlert";

export default function BlacklistPage() {
  const [blacklist, setBlacklist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [newEntry, setNewEntry] = useState({
    phoneNumber: "",
    customerName: "",
    reason: "Did not return battery",
  });
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", type: "success" });
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    id: string;
    phone: string;
  }>({ open: false, id: "", phone: "" });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showAlert = (
    message: string,
    type: "success" | "error" | "warning" | "info",
  ) => {
    setAlert({ open: true, message, type });
  };

  const cleanError = (raw: string) =>
    raw.replace(/[\u2705\u274C\u26A0\uFE0F]/g, "").trim();

  useEffect(() => {
    fetchBlacklist();
  }, []);

  const fetchBlacklist = async (force = false) => {
    try {
      setLoading(true);
      if (force) {
        apiService.invalidateReadCache(["/api/blacklist"]);
        const response = await apiClient.get("/api/blacklist?fresh=1");
        setBlacklist(response.data.blacklist || response.data || []);
      } else {
        const response = await apiService.getBlacklist();
        setBlacklist(response.data.blacklist || response.data || []);
      }
      setError(null);
    } catch (err: any) {
      setError("Failed to fetch blacklist");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.phoneNumber) return;
    try {
      setSubmitting(true);
      await apiService.addToBlacklist(newEntry);
      setShowAddModal(false);
      setNewEntry({
        phoneNumber: "",
        customerName: "",
        reason: "Did not return battery",
      });
      await fetchBlacklist(true);
      showAlert("User added to blacklist successfully", "success");
    } catch (err: any) {
      const raw =
        err.response?.data?.error ||
        err.message ||
        "Failed to add to blacklist";
      showAlert(cleanError(raw), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveFromBlacklist = async () => {
    if (!confirmDelete.id) return;
    try {
      setDeleteLoading(true);
      await apiService.removeFromBlacklist(confirmDelete.id);
      setConfirmDelete({ open: false, id: "", phone: "" });
      await fetchBlacklist(true);
      showAlert("User removed from blacklist successfully", "success");
    } catch (err: any) {
      const raw =
        err.response?.data?.error ||
        err.message ||
        "Failed to remove from blacklist";
      showAlert(cleanError(raw), "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredBlacklist = blacklist.filter(
    (entry: any) =>
      entry.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.reason?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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

      {/* Confirm Delete Modal */}
      {confirmDelete.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              Remove from Blacklist
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to remove{" "}
              <span className="font-semibold">{confirmDelete.phone}</span> from
              the blacklist?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() =>
                  setConfirmDelete({ open: false, id: "", phone: "" })
                }
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveFromBlacklist}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center"
              >
                {deleteLoading && (
                  <FontAwesomeIcon
                    icon={faSpinner}
                    className="animate-spin mr-2"
                  />
                )}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div className="flex items-center mb-4 md:mb-0">
          <FontAwesomeIcon
            icon={faBan}
            className="text-2xl text-red-600 dark:text-red-400 mr-3"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Blacklist
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage blocked users who didn&apos;t return batteries
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Add to Blacklist
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by phone, name, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-96 pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Stats Card */}
      <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-center">
          <FontAwesomeIcon
            icon={faExclamationTriangle}
            className="text-red-600 dark:text-red-400 mr-3"
          />
          <div>
            <p className="text-sm text-red-600 dark:text-red-400">
              Total Blocked Users
            </p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">
              {blacklist.length}
            </p>
          </div>
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
            onClick={() => fetchBlacklist()}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Blacklist Table */}
      {!loading && !error && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Phone Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Customer Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date Added
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredBlacklist.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      {searchTerm
                        ? "No matching entries found"
                        : "No users in blacklist"}
                    </td>
                  </tr>
                ) : (
                  filteredBlacklist.map((entry: any) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-4">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {entry.phoneNumber}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-300">
                        {entry.customerName || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                          {entry.reason}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() =>
                            setConfirmDelete({
                              open: true,
                              id: entry.id,
                              phone: entry.phoneNumber,
                            })
                          }
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-2"
                          title="Remove from blacklist"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Add to Blacklist
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <form onSubmit={handleAddToBlacklist} className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  value={newEntry.phoneNumber}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, phoneNumber: e.target.value })
                  }
                  placeholder="e.g. 252612345678"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={newEntry.customerName}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, customerName: e.target.value })
                  }
                  placeholder="Optional"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason
                </label>
                <select
                  value={newEntry.reason}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, reason: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="Did not return battery">
                    Did not return battery
                  </option>
                  <option value="Damaged battery">Damaged battery</option>
                  <option value="Payment fraud">Payment fraud</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newEntry.phoneNumber}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  {submitting && (
                    <FontAwesomeIcon
                      icon={faSpinner}
                      className="animate-spin mr-2"
                    />
                  )}
                  Add to Blacklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
