import { create } from "zustand";
import { apiService } from "@/lib/api";

interface UserRecord {
  id?: string;
  _id?: string;
  username?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  [key: string]: unknown;
}

interface LoginOtpChallenge {
  challengeId: string;
  email: string;
  otpExpiresAt: number;
  resendAvailableAt: number;
}

interface UsersState {
  users: UserRecord[];
  loading: boolean;
  error: string | null;
  success: string | null;

  fetchUsers: () => Promise<void>;
  loginUser: (credentials: {
    username: string;
    password: string;
  }) => Promise<
    | { kind: "otp"; challenge: LoginOtpChallenge }
    | { kind: "direct"; user: UserRecord; token: string; expiresAt: number }
  >;
  resendLoginOtp: (payload: { challengeId: string }) => Promise<LoginOtpChallenge>;
  verifyLoginOtp: (payload: {
    challengeId: string;
    otp: string;
  }) => Promise<{ user: UserRecord; token: string; expiresAt: string }>;
  registerUser: (userData: Record<string, unknown>) => Promise<void>;
  updateUser: (userId: string, data: Record<string, unknown>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  clearMessages: () => void;
}

export const useUsersStore = create<UsersState>((set) => ({
  users: [],
  loading: false,
  error: null,
  success: null,

  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiService.getUsers();
      set({
        users: response.data.users || response.data || [],
        loading: false,
      });
    } catch (error: any) {
      set({
        error:
          error.response?.data?.message ||
          error.message ||
          "Failed to fetch users",
        loading: false,
      });
    }
  },

  loginUser: async (credentials) => {
    set({ loading: true, error: null, success: null });

    try {
      const response = await apiService.login(credentials);
      // Dev OTP-bypass path: server returns token + user directly.
      if (response.data?.token && response.data?.user) {
        set({ loading: false, success: "Logged in" });
        return {
          kind: "direct" as const,
          user: response.data.user as UserRecord,
          token: String(response.data.token),
          expiresAt: Number(response.data.expiresAt || 0),
        };
      }
      if (!response.data?.otpRequired || !response.data?.challengeId) {
        throw new Error("OTP challenge was not created");
      }

      set({ loading: false, success: "OTP sent" });
      return {
        kind: "otp" as const,
        challenge: {
          challengeId: String(response.data.challengeId),
          email: String(response.data.email || ""),
          otpExpiresAt: Number(response.data.otpExpiresAt || 0),
          resendAvailableAt: Number(response.data.resendAvailableAt || 0),
        },
      };
    } catch (error: any) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || error.response?.data?.error;

      let msg: string;
      if (status === 401 || status === 400) {
        msg = message || "Username ama password way khaldan yihiin";
      } else if (status === 404) {
        msg = "User-kan lama helin";
      } else if (!error.response) {
        if (
          error.code === "ECONNABORTED" ||
          error.message?.includes("timeout")
        ) {
          msg = "Request-ka wuu dhacay (timeout), fadlan mar kale isku day";
        } else {
          msg = "Server-ka lama xiriiri karo, fadlan internet-kaaga hubi";
        }
      } else {
        msg = message || "Wax qalad ah ayaa dhacay, fadlan mar kale isku day";
      }

      set({ error: msg, loading: false });
      throw new Error(msg);
    }
  },

  resendLoginOtp: async ({ challengeId }) => {
    set({ loading: true, error: null, success: null });
    try {
      const response = await apiService.resendLoginOtp({ challengeId });
      set({ loading: false, success: "OTP resent" });
      return {
        challengeId: String(response.data.challengeId || challengeId),
        email: String(response.data.email || ""),
        otpExpiresAt: Number(response.data.otpExpiresAt || 0),
        resendAvailableAt: Number(response.data.resendAvailableAt || 0),
      };
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Failed to resend OTP";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  verifyLoginOtp: async ({ challengeId, otp }) => {
    set({ loading: true, error: null, success: null });
    try {
      const response = await apiService.verifyLoginOtp({ challengeId, otp });
      const userData = response.data.user || {};
      const token = String(response.data.token || "");
      const expiresAt = String(
        response.data.expiresAt || Date.now() + 60 * 60 * 1000,
      );

      if (typeof window !== "undefined" && token) {
        localStorage.setItem("authToken", token);
        localStorage.setItem("sessionUser", JSON.stringify(userData));
        localStorage.setItem("tokenExpiresAt", expiresAt);
      }

      set({ loading: false, success: "Login successful" });
      return { user: userData, token, expiresAt };
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "OTP verification failed";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  registerUser: async (userData) => {
    set({ loading: true, error: null, success: null });
    try {
      await apiService.addUser(userData);
      set({ loading: false, success: "User registered successfully" });
    } catch (error: any) {
      set({
        error:
          error.response?.data?.message ||
          error.message ||
          "Registration failed",
        loading: false,
      });
    }
  },

  updateUser: async (userId, data) => {
    set({ loading: true, error: null, success: null });
    try {
      await apiService.updateUser(userId, data);
      set({ loading: false, success: "User updated successfully" });
      // Refetch users
      useUsersStore.getState().fetchUsers();
    } catch (error: any) {
      set({
        error:
          error.response?.data?.message ||
          error.message ||
          "Failed to update user",
        loading: false,
      });
    }
  },

  deleteUser: async (userId) => {
    set({ loading: true, error: null, success: null });
    try {
      await apiService.deleteUser(userId);
      set((state) => ({
        users: state.users.filter((u) => (u._id || u.id) !== userId),
        loading: false,
        success: "User deleted successfully",
      }));
    } catch (error: any) {
      set({
        error:
          error.response?.data?.message ||
          error.message ||
          "Failed to delete user",
        loading: false,
      });
    }
  },

  clearMessages: () => set({ error: null, success: null }),
}));
