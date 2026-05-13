"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPen,
  faTrash,
  faInfoCircle,
  faSyncAlt,
} from "@fortawesome/free-solid-svg-icons";
import { apiService } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import CustomAlert from "@/components/CustomAlert";

export default function StationsPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [stations, setStations] = useState<any[]>([]);
  const [filteredStations, setFilteredStations] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [form, setForm] = useState({
    imei: "",
    name: "",
    iccid: "",
    location: "",
    totalSlots: "",
  });
  const [search, setSearch] = useState("");
  const [alert, setAlert] = useState({
    open: false,
    message: "",
    type: "" as "success" | "error" | "warning" | "info",
  });
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    station: any;
  }>({ open: false, station: null });
  const [editId, setEditId] = useState<string | null>(null);

  const showAlert = (
    message: string,
    type: "success" | "error" | "warning" | "info",
  ) => {
    setAlert({ open: true, message, type });
    setTimeout(
      () => setAlert({ open: false, message: "", type: "info" }),
      2000,
    );
  };

  const fetchStations = async (force = false) => {
    const response = await apiService.getStations(force);
    const nextStations = response.data.stations || [];
    setStations(nextStations);
    setFilteredStations(
      search
        ? nextStations.filter(
            (station: any) =>
              station.imei?.toLowerCase().includes(search.toLowerCase()) ||
              station.name?.toLowerCase().includes(search.toLowerCase()) ||
              station.iccid?.toLowerCase().includes(search.toLowerCase()) ||
              station.location?.toLowerCase().includes(search.toLowerCase()),
          )
        : nextStations,
    );
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const openAddModal = () => {
    setForm({ imei: "", name: "", iccid: "", location: "", totalSlots: "" });
    setSelectedStation(null);
    setModalOpen(true);
  };

  const openEditModal = (station: any) => {
    setForm({
      imei: station.imei,
      name: station.name,
      iccid: station.iccid,
      location: station.location,
      totalSlots: station.totalSlots,
    });
    setSelectedStation(station);
    setEditId(station.id);
    setEditModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditModalOpen(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.addStation({
        imei: form.imei,
        name: form.name,
        iccid: form.iccid,
        location: form.location,
        totalSlots: Number(form.totalSlots),
      });
      showAlert("Station registered successfully!", "success");
      setTimeout(() => {
        closeModal();
        fetchStations(true);
      }, 1000);
    } catch (error: any) {
      showAlert(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Something went wrong!",
        "error",
      );
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.updateStation(editId!, {
        imei: form.imei,
        name: form.name,
        iccid: form.iccid,
        location: form.location,
        totalSlots: Number(form.totalSlots),
      });
      showAlert("Station updated successfully!", "success");
      setTimeout(() => {
        closeModal();
        fetchStations(true);
      }, 1000);
    } catch (error: any) {
      showAlert(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Something went wrong!",
        "error",
      );
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearch(term);
    const filtered = stations.filter(
      (station) =>
        station.imei?.toLowerCase().includes(term.toLowerCase()) ||
        station.name?.toLowerCase().includes(term.toLowerCase()) ||
        station.iccid?.toLowerCase().includes(term.toLowerCase()) ||
        station.location?.toLowerCase().includes(term.toLowerCase()),
    );
    setFilteredStations(filtered);
  };

  const handleDelete = async () => {
    if (!confirmDelete.station) return;
    try {
      await apiService.deleteStation(confirmDelete.station.imei);
      showAlert("Station deleted successfully!", "error");
      setTimeout(() => {
        setConfirmDelete({ open: false, station: null });
        fetchStations(true);
      }, 1000);
    } catch (error: any) {
      showAlert(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Something went wrong!",
        "error",
      );
    }
  };

  const handleSync = async () => {
    try {
      setAlert({ open: true, message: "Syncing from HeyCharge...", type: "info" });
      const response = await apiService.syncStations();
      showAlert(response.data.message || "Sync complete!", "success");
      void fetchStations(true);
    } catch (error: any) {
      showAlert(
        error.response?.data?.error || "Failed to sync stations",
        "error"
      );
    }
  };

  return (
    <div className="p-4">
      {alert.open && (
        <CustomAlert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert({ open: false, message: "", type: "info" })}
        />
      )}
      <div className="flex flex-col mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-2xl font-bold dark:text-white">
            Station Management
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Manage all power bank rental stations
          </p>
        </div>
        <div className="flex flex-col gap-2 mt-4 md:mt-0 md:flex-row">
          <button
            className="flex items-center px-5 py-2 font-semibold text-gray-700 transition-all duration-200 bg-white border border-gray-300 rounded-lg shadow hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
            onClick={handleSync}
          >
            <FontAwesomeIcon icon={faSyncAlt} className="mr-2" /> Sync from HeyCharge
          </button>
          <button
            className="flex items-center px-5 py-2 font-semibold text-white transition-all duration-200 rounded-lg shadow-lg bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
            onClick={openAddModal}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2" /> Add New Station
          </button>
        </div>
      </div>

      {/* Add Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg p-8 bg-white shadow-2xl dark:bg-gray-800 rounded-2xl">
            <button
              className="absolute text-xl text-gray-400 top-4 right-4 hover:text-blue-600 dark:hover:text-white focus:outline-none"
              onClick={closeModal}
            >
              &times;
            </button>
            <h4 className="mb-6 text-2xl font-bold text-gray-800 dark:text-white">
              Add Station
            </h4>
            <form onSubmit={handleAdd} className="space-y-5">
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  IMEI
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="IMEI"
                  value={form.imei}
                  onChange={(e) => setForm({ ...form, imei: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Name
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  ICCID
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="ICCID"
                  value={form.iccid}
                  onChange={(e) => setForm({ ...form, iccid: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Location
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="Location"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Total Slots
                </label>
                <input
                  type="number"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="Total Slots"
                  value={form.totalSlots}
                  onChange={(e) =>
                    setForm({ ...form, totalSlots: e.target.value })
                  }
                  required
                  min={1}
                />
              </div>
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  className="px-5 py-2 text-gray-700 transition bg-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-white transition bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg p-8 bg-white shadow-2xl dark:bg-gray-800 rounded-2xl">
            <button
              className="absolute text-xl text-gray-400 top-4 right-4 hover:text-blue-600 dark:hover:text-white focus:outline-none"
              onClick={closeModal}
            >
              &times;
            </button>
            <h4 className="mb-6 text-2xl font-bold text-gray-800 dark:text-white">
              Edit Station
            </h4>
            <form onSubmit={handleUpdate} className="space-y-5">
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  IMEI
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="IMEI"
                  value={form.imei}
                  onChange={(e) => setForm({ ...form, imei: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Name
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  ICCID
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="ICCID"
                  value={form.iccid}
                  onChange={(e) => setForm({ ...form, iccid: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Location
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="Location"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Total Slots
                </label>
                <input
                  type="number"
                  className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-white"
                  placeholder="Total Slots"
                  value={form.totalSlots}
                  onChange={(e) =>
                    setForm({ ...form, totalSlots: e.target.value })
                  }
                  required
                  min={1}
                />
              </div>
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  className="px-5 py-2 text-gray-700 transition bg-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-white transition bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="relative w-full max-w-md p-8 bg-white shadow-2xl dark:bg-gray-800 rounded-2xl">
            <button
              className="absolute text-xl text-gray-400 top-4 right-4 hover:text-blue-600 dark:hover:text-white focus:outline-none"
              onClick={() => setConfirmDelete({ open: false, station: null })}
            >
              &times;
            </button>
            <h4 className="mb-6 text-2xl font-bold text-gray-800 dark:text-white">
              Are you sure you want to delete this station?
            </h4>
            <div className="flex justify-end mt-6 space-x-3">
              <button
                className="px-5 py-2 text-gray-700 transition bg-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"
                onClick={() => setConfirmDelete({ open: false, station: null })}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 text-white transition bg-red-600 rounded-lg hover:bg-red-700"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Station Table */}
      <div className="mb-6 transition-colors duration-300 bg-white rounded-lg shadow dark:bg-gray-800">
        <div className="p-4 border-b dark:border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="relative w-full mb-4 md:w-64 md:mb-0">
              <input
                type="text"
                placeholder="Search stations..."
                value={search}
                onChange={handleSearch}
                className="w-full py-2 pl-8 pr-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              />
              <span className="absolute text-gray-400 left-2 top-3">
                <FontAwesomeIcon icon={faPlus} />
              </span>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    IMEI
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    ICCID
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Location
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Total Slots
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                {filteredStations.map((station) => (
                  <tr key={station.imei}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap dark:text-gray-300">
                      {station.imei}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                      {station.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                      {station.iccid}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                      {station.location}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                      {station.totalSlots}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300 flex gap-2">
                      <button
                        className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 transition shadow"
                        onClick={() => openEditModal(station)}
                        title="Edit"
                      >
                        <FontAwesomeIcon
                          icon={faPen}
                          className="text-blue-600 text-lg"
                        />
                      </button>
                      {currentUser?.role === "admin" && (
                        <button
                          className="p-2 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 transition shadow"
                          onClick={() =>
                            setConfirmDelete({ open: true, station })
                          }
                          title="Delete"
                        >
                          <FontAwesomeIcon
                            icon={faTrash}
                            className="text-red-600 text-lg"
                          />
                        </button>
                      )}
                      <button
                        className="p-2 rounded-full bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 transition shadow"
                        onClick={() => router.push(`/station/${station.imei}`)}
                        title="View Stats"
                      >
                        <FontAwesomeIcon
                          icon={faInfoCircle}
                          className="text-indigo-600 text-lg"
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
