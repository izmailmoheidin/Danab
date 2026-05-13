"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faUser,
  faTimes,
  faCheck,
  faTrash,
  faPen,
} from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/stores/useAuthStore";
import { apiService } from "@/lib/api";
import CustomAlert from "@/components/CustomAlert";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add User Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    role: "User",
    permissions: [] as string[],
  });
  const [success, setSuccess] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  // Edit User Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "",
    username: "",
    password: "",
    email: "",
    role: "User",
    permissions: [] as string[],
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Alert State
  const [alert, setAlert] = useState({
    open: false,
    message: "",
    type: "" as "success" | "error" | "warning" | "info",
  });

  // Delete State
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    user: any;
  }>({ open: false, user: null });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showAlert = (
    message: string,
    type: "success" | "error" | "warning" | "info",
  ) => {
    setAlert({ open: true, message, type });
  };

  const fetchUsers = async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiService.getUsers(force);
      setUsers(res.data.users || res.data || []);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Failed to fetch users",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEditInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  // Add User Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError("");
    try {
      await apiService.addUser({
        username: form.username,
        password: form.password,
        email: form.email,
        role: form.role.toLowerCase(),
        permissions: form.permissions,
      });
      setSuccess(true);
      setForm({
        username: "",
        password: "",
        email: "",
        role: "User",
        permissions: [],
      });
      await fetchUsers(true);
      showAlert("User created successfully!", "success");
      setTimeout(() => {
        setSuccess(false);
        setModalOpen(false);
      }, 1500);
    } catch (err: any) {
      const raw =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Something went wrong";
      const errorMessage = raw
        .replace(/[\u2705\u274C\u26A0\uFE0F]/g, "")
        .trim();
      setModalError(errorMessage);
      showAlert(errorMessage, "error");
    } finally {
      setModalLoading(false);
    }
  };

  // Edit User Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    try {
      await apiService.updateUser(editForm.username, {
        username: editForm.username,
        password: editForm.password,
        email: editForm.email,
        role: editForm.role.toLowerCase(),
        permissions: editForm.permissions,
      });
      await fetchUsers(true);
      showAlert("User updated successfully!", "success");
      setEditModalOpen(false);
    } catch (err: any) {
      const raw =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Something went wrong";
      const errorMessage = raw
        .replace(/[\u2705\u274C\u26A0\uFE0F]/g, "")
        .trim();
      setEditError(errorMessage);
      showAlert(errorMessage, "error");
    } finally {
      setEditLoading(false);
    }
  };

  const openEditModal = (user: any) => {
    setEditForm({
      id: user.id,
      username: user.username || "",
      password: "",
      email: user.email || "",
      role: user.role
        ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
        : "User",
      permissions: user.permissions || [],
    });
    setEditModalOpen(true);
    setEditError("");
  };

  const handleDeleteUser = (user: any) => {
    setConfirmDelete({ open: true, user });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete.user) return;
    setDeleteLoading(true);
    try {
      await apiService.deleteUser(confirmDelete.user.id);
      showAlert("User deleted successfully!", "success");
      await fetchUsers(true);
    } catch (err: any) {
      const raw =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Something went wrong";
      const errorMessage = raw
        .replace(/[\u2705\u274C\u26A0\uFE0F]/g, "")
        .trim();
      showAlert(errorMessage, "error");
    } finally {
      setDeleteLoading(false);
      setConfirmDelete({ open: false, user: null });
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete({ open: false, user: null });
  };

  return (
    <ProtectedRoute adminOnly>
      <div className="p-4">
        {alert.open && (
          <CustomAlert
            message={alert.message}
            type={alert.type}
            onClose={() => setAlert({ ...alert, open: false })}
          />
        )}
        <div className="flex flex-col mb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-2xl font-bold dark:text-white">Users</h3>
            <p className="text-gray-500 dark:text-gray-400">
              Manage system users, permissions, and roles
            </p>
          </div>
          {currentUser?.role === "admin" && (
            <button
              className="flex items-center px-5 py-2 mt-4 font-semibold text-white transition-all duration-200 rounded-lg shadow-lg md:mt-0 bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
              onClick={() => setModalOpen(true)}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" /> Add New User
            </button>
          )}
        </div>

        {/* Add User Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 bg-black bg-opacity-40 backdrop-blur-sm">
            <div className="relative w-full max-w-lg p-8 bg-white shadow-2xl dark:bg-gray-900 rounded-2xl">
              <button
                className="absolute text-xl text-gray-400 top-4 right-4 hover:text-blue-600 dark:hover:text-white focus:outline-none"
                onClick={() => setModalOpen(false)}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <div className="flex items-center mb-6">
                <div className="p-3 mr-3 text-blue-600 bg-blue-100 rounded-full">
                  <FontAwesomeIcon icon={faUser} className="text-2xl" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                  Add New User
                </h2>
              </div>
              {success ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 mb-4 text-green-600 bg-green-100 rounded-full">
                    <FontAwesomeIcon icon={faCheck} className="text-3xl" />
                  </div>
                  <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                    User created successfully!
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                      Username
                    </label>
                    <input
                      type="text"
                      name="username"
                      value={form.username}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                      placeholder="Enter username"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                      Password
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                      placeholder="Enter password"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                      placeholder="Enter email address"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                      Role
                    </label>
                    <select
                      name="role"
                      value={form.role}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="User">User</option>
                      <option value="Moderator">Moderator</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                  {modalError && (
                    <div className="px-4 py-2 mb-2 font-medium text-center text-red-600 bg-red-100 rounded dark:bg-red-900 dark:text-red-300">
                      {modalError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="w-full px-4 py-2 font-semibold text-white transition-all duration-200 rounded-lg shadow-lg bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60"
                  >
                    {modalLoading ? "Creating..." : "Create User"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 bg-black bg-opacity-40 backdrop-blur-sm">
            <div className="relative w-full max-w-lg p-8 bg-white shadow-2xl dark:bg-gray-900 rounded-2xl">
              <button
                className="absolute text-xl text-gray-400 top-4 right-4 hover:text-blue-600 dark:hover:text-white focus:outline-none"
                onClick={() => setEditModalOpen(false)}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <div className="flex items-center mb-6">
                <div className="p-3 mr-3 text-blue-600 bg-blue-100 rounded-full">
                  <FontAwesomeIcon icon={faUser} className="text-2xl" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                  Edit User
                </h2>
              </div>
              <form onSubmit={handleEditSubmit} className="space-y-5">
                <div>
                  <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                    Username
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={editForm.username}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={editForm.password}
                    onChange={handleEditInputChange}
                    className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                    placeholder="Enter new password (leave blank to keep current)"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={editForm.email}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                    Role
                  </label>
                  <select
                    name="role"
                    value={editForm.role}
                    onChange={handleEditInputChange}
                    className="w-full px-4 py-2 transition-all border border-gray-200 rounded-lg dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="User">User</option>
                    <option value="Moderator">Moderator</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                {editError && (
                  <div className="px-4 py-2 mb-2 font-medium text-center text-red-600 bg-red-100 rounded dark:bg-red-900 dark:text-red-300">
                    {editError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={editLoading}
                  className="w-full px-4 py-2 font-semibold text-white transition-all duration-200 rounded-lg shadow-lg bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60"
                >
                  {editLoading ? "Updating..." : "Update User"}
                </button>
              </form>
            </div>
          </div>
        )}

        {loading && (
          <div className="mb-4 text-blue-600 dark:text-blue-400">
            Loading users...
          </div>
        )}
        {error && (
          <div className="mb-4 text-red-600 dark:text-red-400">{error}</div>
        )}

        <div className="mb-6 transition-colors duration-300 bg-white rounded-lg shadow dark:bg-gray-800">
          <div className="p-4 border-b dark:border-gray-700">
            <h3 className="text-lg font-semibold dark:text-white">User List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Email
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Role
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Created
                  </th>
                  <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                {users.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user: any) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap dark:text-gray-300">
                        {user.username || user.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                        {user.role}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                        {user.createdAt && user.createdAt._seconds
                          ? new Date(
                              user.createdAt._seconds * 1000,
                            ).toLocaleString()
                          : ""}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap dark:text-gray-300">
                        {currentUser?.role === "admin" && (
                          <>
                            <button
                              className="p-2 mr-3 transition rounded-full hover:bg-blue-100 dark:hover:bg-blue-900"
                              onClick={() => openEditModal(user)}
                              title="Edit"
                            >
                              <FontAwesomeIcon
                                icon={faPen}
                                className="text-blue-600 dark:text-blue-400"
                              />
                            </button>
                            <button
                              className="p-2 transition rounded-full hover:bg-red-100 dark:hover:bg-red-900"
                              onClick={() => handleDeleteUser(user)}
                              title="Delete"
                            >
                              <FontAwesomeIcon
                                icon={faTrash}
                                className="text-red-600 dark:text-red-400"
                              />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation */}
        {confirmDelete.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
            <div className="relative w-full max-w-md p-8 bg-white shadow-2xl dark:bg-gray-900 rounded-2xl">
              <h3 className="mb-4 text-xl font-bold text-gray-800 dark:text-white">
                Are you sure you want to delete this user?
              </h3>
              <p className="mb-6 text-gray-600 dark:text-gray-300">
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  className="px-5 py-2 text-gray-700 transition bg-gray-200 rounded-lg dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  onClick={handleCancelDelete}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  className="px-5 py-2 text-white transition bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
                  onClick={handleConfirmDelete}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
