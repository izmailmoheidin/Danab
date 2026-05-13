import axios, { AxiosResponse } from "axios";

// API routes are served from the same Next.js app (serverless)
const API_BASE_URL = "";

const GET_TTL = {
  SHORT: 20_000,
  MEDIUM: 30_000,
  LONG: 60_000,
} as const;

type CachedGetEntry = {
  response: AxiosResponse<any>;
  expiresAt: number;
};

const getResponseCache = new Map<string, CachedGetEntry>();
const inFlightGetRequests = new Map<string, Promise<AxiosResponse<any>>>();

export const API_ENDPOINTS = {
  // Users
  USERS_ALL: "/api/users/all",
  USERS_LOGIN: "/api/users/login",
  USERS_LOGIN_VERIFY_OTP: "/api/users/login/verify-otp",
  USERS_LOGIN_RESEND_OTP: "/api/users/login/resend-otp",
  USERS_ADD: "/api/users/add",
  USERS_UPDATE: "/api/users/update",
  USERS_DELETE: "/api/users/delete",
  // Stations
  STATIONS_BASIC: "/api/stations/basic",
  STATIONS_ADD: "/api/stations/add",
  STATIONS_UPDATE: "/api/stations/update",
  STATIONS_DELETE: "/api/stations/delete",
  STATIONS_STATS: "/api/stations/stats",
  HEYCHARGE_LIVE: "/api/heycharge/live",
  // Transactions
  LATEST_TRANSACTIONS: "/api/transactions/latest",
  TRANSACTION_HISTORY: "/api/transactions/history",
  RENTAL_MARK_RETURNED: "/api/rentals/mark-returned",
  // Revenue
  DAILY_REVENUE: "/api/revenue/daily",
  MONTHLY_REVENUE: "/api/revenue/monthly",
  // Customers
  DAILY_CUSTOMERS_BY_IMEI: "/api/customers/daily-by-imei",
  MONTHLY_CUSTOMERS_BY_IMEI: "/api/customers/monthly-by-imei",
  DAILY_TOTAL_CUSTOMERS: "/api/customers/daily-total",
  MONTHLY_TOTAL_CUSTOMERS: "/api/customers/monthly-total",
  // Dashboard
  DASHBOARD_SUMMARY: "/api/dashboard/summary",
  // Charts
  CHARTS_BY_IMEI: "/api/charts",
  CHARTS_ALL: "/api/chartsAll/all",
  // Payment
  PAYMENT_PROCESS: "/api/pay",
  // Blacklist
  BLACKLIST: "/api/blacklist",
  BLACKLIST_CHECK: "/api/blacklist/check",
  // Problem Slots
  PROBLEM_SLOTS: "/api/problem-slots",
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - attach auth token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const requestUrl = String(error.config?.url || "");
      const isAuthFlowRequest =
        requestUrl.startsWith(API_ENDPOINTS.USERS_LOGIN) ||
        requestUrl.startsWith(API_ENDPOINTS.USERS_LOGIN_VERIFY_OTP) ||
        requestUrl.startsWith(API_ENDPOINTS.USERS_LOGIN_RESEND_OTP);
      switch (error.response.status) {
        case 401:
          if (typeof window !== "undefined" && !isAuthFlowRequest) {
            localStorage.removeItem("authToken");
            localStorage.removeItem("sessionUser");
            localStorage.removeItem("tokenExpiresAt");
            void fetch("/api/users/logout", {
              method: "POST",
              credentials: "include",
              keepalive: true,
            }).catch(() => undefined);
            clearApiGetCache();
            window.location.href = "/login";
          }
          break;
      }
    }
    return Promise.reject(error);
  },
);

function getAuthCacheSegment(): string {
  if (typeof window === "undefined") return "server";
  return localStorage.getItem("authToken") || "anonymous";
}

function buildGetCacheKey(endpoint: string): string {
  return `${getAuthCacheSegment()}::${endpoint}`;
}

function extractEndpointFromCacheKey(cacheKey: string): string {
  const separator = cacheKey.indexOf("::");
  return separator === -1 ? cacheKey : cacheKey.slice(separator + 2);
}

function pruneExpiredGetCache(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(getResponseCache.entries())) {
    if (entry.expiresAt <= now) {
      getResponseCache.delete(key);
    }
  }
}

export function clearApiGetCache(): void {
  getResponseCache.clear();
  inFlightGetRequests.clear();
}

export function invalidateApiGetCachePrefixes(prefixes: string[]): void {
  if (!prefixes.length) return;

  for (const key of Array.from(getResponseCache.keys())) {
    const endpoint = extractEndpointFromCacheKey(key);
    if (prefixes.some((prefix) => endpoint.startsWith(prefix))) {
      getResponseCache.delete(key);
    }
  }

  for (const key of Array.from(inFlightGetRequests.keys())) {
    const endpoint = extractEndpointFromCacheKey(key);
    if (prefixes.some((prefix) => endpoint.startsWith(prefix))) {
      inFlightGetRequests.delete(key);
    }
  }
}

async function cachedGet<T = any>(
  endpoint: string,
  ttlMs: number,
): Promise<AxiosResponse<T>> {
  if (ttlMs <= 0) {
    return apiClient.get<T>(endpoint);
  }

  pruneExpiredGetCache();
  const cacheKey = buildGetCacheKey(endpoint);
  const cached = getResponseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.response as AxiosResponse<T>;
  }

  const existingInFlight = inFlightGetRequests.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight as Promise<AxiosResponse<T>>;
  }

  const requestPromise = apiClient
    .get<T>(endpoint)
    .then((response) => {
      getResponseCache.set(cacheKey, {
        response,
        expiresAt: Date.now() + ttlMs,
      });
      return response;
    })
    .finally(() => {
      inFlightGetRequests.delete(cacheKey);
    });

  inFlightGetRequests.set(cacheKey, requestPromise as Promise<AxiosResponse>);
  return requestPromise;
}

function runMutation<T>(
  request: Promise<AxiosResponse<T>>,
  invalidationPrefixes: string[],
): Promise<AxiosResponse<T>> {
  return request.then((response) => {
    invalidateApiGetCachePrefixes(invalidationPrefixes);
    return response;
  });
}

export const apiService = {
  clearReadCache: clearApiGetCache,
  invalidateReadCache: invalidateApiGetCachePrefixes,

  // Users
  getUsers: (fresh = false) => {
    const endpoint = fresh
      ? `${API_ENDPOINTS.USERS_ALL}?fresh=1`
      : API_ENDPOINTS.USERS_ALL;

    if (!fresh) {
      return cachedGet(endpoint, GET_TTL.MEDIUM);
    }

    invalidateApiGetCachePrefixes([API_ENDPOINTS.USERS_ALL]);
    return apiClient.get(endpoint, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  },
  login: (credentials: { username: string; password: string }) =>
    apiClient.post(API_ENDPOINTS.USERS_LOGIN, credentials, { timeout: 60_000 }),
  verifyLoginOtp: (payload: { challengeId: string; otp: string }) =>
    apiClient.post(API_ENDPOINTS.USERS_LOGIN_VERIFY_OTP, payload, {
      timeout: 60_000,
    }),
  resendLoginOtp: (payload: { challengeId: string }) =>
    apiClient.post(API_ENDPOINTS.USERS_LOGIN_RESEND_OTP, payload, {
      timeout: 60_000,
    }),
  addUser: (userData: Record<string, unknown>) =>
    runMutation(apiClient.post(API_ENDPOINTS.USERS_ADD, userData), [
      API_ENDPOINTS.USERS_ALL,
    ]),
  updateUser: (username: string, data: Record<string, unknown>) =>
    runMutation(
      apiClient.put(
        `${API_ENDPOINTS.USERS_UPDATE}?username=${encodeURIComponent(username)}`,
        data,
      ),
      [API_ENDPOINTS.USERS_ALL],
    ),
  deleteUser: (id: string) =>
    runMutation(apiClient.delete(`${API_ENDPOINTS.USERS_DELETE}?id=${id}`), [
      API_ENDPOINTS.USERS_ALL,
    ]),

  // Stations
  getStations: (fresh = false) => {
    const endpoint = fresh
      ? `${API_ENDPOINTS.STATIONS_BASIC}?fresh=1`
      : API_ENDPOINTS.STATIONS_BASIC;

    if (!fresh) {
      return cachedGet(endpoint, GET_TTL.LONG);
    }

    invalidateApiGetCachePrefixes([API_ENDPOINTS.STATIONS_BASIC]);
    return apiClient.get(endpoint, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  },
  addStation: (data: Record<string, unknown>) =>
    runMutation(apiClient.post(API_ENDPOINTS.STATIONS_ADD, data), [
      "/api/stations",
      API_ENDPOINTS.LATEST_TRANSACTIONS,
    ]),
  updateStation: (id: string, data: Record<string, unknown>) =>
    runMutation(apiClient.put(`${API_ENDPOINTS.STATIONS_UPDATE}/${id}`, data), [
      "/api/stations",
      API_ENDPOINTS.LATEST_TRANSACTIONS,
    ]),
  deleteStation: (imei: string) =>
    runMutation(apiClient.delete(`${API_ENDPOINTS.STATIONS_DELETE}/${imei}`), [
      "/api/stations",
      API_ENDPOINTS.LATEST_TRANSACTIONS,
    ]),
  syncStations: () =>
    runMutation(apiClient.post("/api/stations/sync"), ["/api/stations"]),
  getStationStats: async (imei: string, fresh = false) => {
    const endpoint = `${API_ENDPOINTS.STATIONS_STATS}/${imei}`;
    const resolvedEndpoint = fresh ? `${endpoint}?fresh=1` : endpoint;

    const response = await apiClient.get(resolvedEndpoint, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
    return response;
  },
  getLiveHeyChargeStations: async (imei = "") => {
    const searchParams = new URLSearchParams();
    searchParams.set("fresh", "1");
    if (imei.trim()) {
      searchParams.set("imei", imei.trim());
    }

    return apiClient.get(
      `${API_ENDPOINTS.HEYCHARGE_LIVE}?${searchParams.toString()}`,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  },

  // Transactions
  getLatestTransactions: () =>
    cachedGet(API_ENDPOINTS.LATEST_TRANSACTIONS, GET_TTL.SHORT),
  getTransactionHistory: async ({
    fresh = false,
    phone = "",
    battery = "",
    waafi = "",
    station = "",
    status = "all",
    startDate = "",
    endDate = "",
  }: {
    fresh?: boolean;
    phone?: string;
    battery?: string;
    waafi?: string;
    station?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (fresh) searchParams.set("fresh", "1");
    if (phone.trim()) searchParams.set("phone", phone.trim());
    if (battery.trim()) searchParams.set("battery", battery.trim());
    if (waafi.trim()) searchParams.set("waafi", waafi.trim());
    if (startDate.trim()) searchParams.set("startDate", startDate.trim());
    if (endDate.trim()) searchParams.set("endDate", endDate.trim());
    if (station.trim() && station !== "all") {
      searchParams.set("station", station.trim());
    }
    if (status.trim() && status !== "all") {
      searchParams.set("status", status.trim());
    }

    const endpoint = searchParams.size
      ? `${API_ENDPOINTS.TRANSACTION_HISTORY}?${searchParams.toString()}`
      : API_ENDPOINTS.TRANSACTION_HISTORY;

    const hasFilters =
      phone.trim() ||
      battery.trim() ||
      waafi.trim() ||
      startDate.trim() ||
      endDate.trim() ||
      (station.trim() && station !== "all") ||
      (status.trim() && status !== "all");

    if (!fresh && !hasFilters) {
      return cachedGet(endpoint, GET_TTL.SHORT);
    }

    const response = await apiClient.get(endpoint, {
      headers: {
        "Cache-Control": "no-store",
      },
    });

    invalidateApiGetCachePrefixes([API_ENDPOINTS.TRANSACTION_HISTORY]);
    return response;
  },
  markRentalReturned: (id: string, note = "") =>
    runMutation(
      apiClient.patch(API_ENDPOINTS.RENTAL_MARK_RETURNED, { id, note }),
      [
        API_ENDPOINTS.TRANSACTION_HISTORY,
        API_ENDPOINTS.STATIONS_STATS,
        API_ENDPOINTS.DASHBOARD_SUMMARY,
        "/api/revenue",
        "/api/customers",
        "/api/charts",
        API_ENDPOINTS.CHARTS_ALL,
      ],
    ),

  // Revenue
  getDailyRevenue: (imei?: string) =>
    imei
      ? cachedGet(`${API_ENDPOINTS.DAILY_REVENUE}/${imei}`, GET_TTL.MEDIUM)
      : cachedGet(API_ENDPOINTS.DAILY_REVENUE, GET_TTL.MEDIUM),
  getMonthlyRevenue: (imei?: string) =>
    imei
      ? cachedGet(`${API_ENDPOINTS.MONTHLY_REVENUE}/${imei}`, GET_TTL.MEDIUM)
      : cachedGet(API_ENDPOINTS.MONTHLY_REVENUE, GET_TTL.MEDIUM),
  getAllDailyRevenue: () =>
    cachedGet(API_ENDPOINTS.DAILY_REVENUE, GET_TTL.MEDIUM),
  getAllMonthlyRevenue: () =>
    cachedGet(API_ENDPOINTS.MONTHLY_REVENUE, GET_TTL.MEDIUM),

  // Customers
  getDailyCustomers: (imei: string) =>
    cachedGet(
      `${API_ENDPOINTS.DAILY_CUSTOMERS_BY_IMEI}/${imei}`,
      GET_TTL.MEDIUM,
    ),
  getMonthlyCustomers: (imei: string) =>
    cachedGet(
      `${API_ENDPOINTS.MONTHLY_CUSTOMERS_BY_IMEI}/${imei}`,
      GET_TTL.MEDIUM,
    ),
  getDailyTotalCustomers: () =>
    cachedGet(API_ENDPOINTS.DAILY_TOTAL_CUSTOMERS, GET_TTL.MEDIUM),
  getMonthlyTotalCustomers: () =>
    cachedGet(API_ENDPOINTS.MONTHLY_TOTAL_CUSTOMERS, GET_TTL.MEDIUM),

  // Dashboard
  getDashboardSummary: () =>
    cachedGet(API_ENDPOINTS.DASHBOARD_SUMMARY, GET_TTL.MEDIUM),

  // Charts
  getChartsByImei: (imei: string) =>
    cachedGet(`${API_ENDPOINTS.CHARTS_BY_IMEI}/${imei}`, GET_TTL.LONG),
  getAllCharts: () => cachedGet(API_ENDPOINTS.CHARTS_ALL, GET_TTL.LONG),

  // Blacklist
  getBlacklist: () => cachedGet(API_ENDPOINTS.BLACKLIST, GET_TTL.MEDIUM),
  addToBlacklist: (data: Record<string, unknown>) =>
    runMutation(apiClient.post(API_ENDPOINTS.BLACKLIST, data), [
      API_ENDPOINTS.BLACKLIST,
      API_ENDPOINTS.BLACKLIST_CHECK,
    ]),
  checkBlacklist: (phoneNumber: string) =>
    cachedGet(`${API_ENDPOINTS.BLACKLIST_CHECK}/${phoneNumber}`, GET_TTL.SHORT),
  removeFromBlacklist: (id: string) =>
    runMutation(apiClient.delete(`${API_ENDPOINTS.BLACKLIST}/${id}`), [
      API_ENDPOINTS.BLACKLIST,
      API_ENDPOINTS.BLACKLIST_CHECK,
    ]),

  // Problem Slots
  getProblemSlots: () => cachedGet(API_ENDPOINTS.PROBLEM_SLOTS, GET_TTL.MEDIUM),
  resolveProblemSlot: (id: string, resolved: boolean) =>
    runMutation(
      apiClient.patch(API_ENDPOINTS.PROBLEM_SLOTS, { id, resolved }),
      [API_ENDPOINTS.PROBLEM_SLOTS],
    ),
  deleteProblemSlot: (id: string) =>
    runMutation(
      apiClient.delete(API_ENDPOINTS.PROBLEM_SLOTS, { data: { id } }),
      [API_ENDPOINTS.PROBLEM_SLOTS],
    ),

  // Payment
  processPayment: (stationCode: string, data: Record<string, unknown>) =>
    runMutation(
      apiClient.post(`${API_ENDPOINTS.PAYMENT_PROCESS}/${stationCode}`, data),
      [
        API_ENDPOINTS.LATEST_TRANSACTIONS,
        API_ENDPOINTS.DASHBOARD_SUMMARY,
        "/api/revenue",
        "/api/customers",
        "/api/charts",
        API_ENDPOINTS.CHARTS_ALL,
      ],
    ),
};
