import { create } from 'zustand';
import { apiService } from '@/lib/api';

const DATA_CACHE_TTL_MS = 30_000;

interface DataState {
  stations: any[];
  transactions: any[];
  users: any[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  fetchData: (options?: { force?: boolean }) => Promise<void>;
  refetch: () => Promise<void>;
}

function isCurrentUserAdmin(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const raw = localStorage.getItem('sessionUser');
    if (!raw) return false;
    const user = JSON.parse(raw);
    return (user?.role || '').toLowerCase() === 'admin';
  } catch {
    return false;
  }
}

export const useDataStore = create<DataState>((set) => ({
  stations: [],
  transactions: [],
  users: [],
  loading: true,
  error: null,
  lastFetchedAt: null,

  fetchData: async (options) => {
    const force = options?.force === true;
    const state = useDataStore.getState();
    const now = Date.now();

    if (
      !force &&
      state.lastFetchedAt &&
      now - state.lastFetchedAt < DATA_CACHE_TTL_MS
    ) {
      return;
    }

    set({ loading: true, error: null });

    const shouldFetchUsers = isCurrentUserAdmin();
    const results = await Promise.allSettled([
      apiService.getStations(),
      apiService.getLatestTransactions(),
      shouldFetchUsers
        ? apiService.getUsers()
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const [stationsRes, transactionsRes, usersRes] = results;
    const nextStations =
      stationsRes.status === 'fulfilled'
        ? stationsRes.value.data.stations || stationsRes.value.data || []
        : state.stations;
    const nextTransactions =
      transactionsRes.status === 'fulfilled'
        ? transactionsRes.value.data || []
        : state.transactions;
    const nextUsers =
      usersRes.status === 'fulfilled'
        ? usersRes.value.data.users || usersRes.value.data || []
        : state.users;

    const errors: string[] = [];
    if (stationsRes.status === 'rejected') {
      errors.push(
        stationsRes.reason?.response?.data?.message ||
          stationsRes.reason?.message ||
          'Failed to fetch stations',
      );
    }
    if (transactionsRes.status === 'rejected') {
      errors.push(
        transactionsRes.reason?.response?.data?.message ||
          transactionsRes.reason?.message ||
          'Failed to fetch transactions',
      );
    }
    if (shouldFetchUsers && usersRes.status === 'rejected') {
      errors.push(
        usersRes.reason?.response?.data?.message ||
          usersRes.reason?.message ||
          'Failed to fetch users',
      );
    }

    set({
      stations: nextStations,
      transactions: nextTransactions,
      users: nextUsers,
      loading: false,
      error: errors.length ? errors[0] : null,
      lastFetchedAt: now,
    });
  },

  refetch: async () => {
    apiService.clearReadCache();
    await useDataStore.getState().fetchData({ force: true });
  },
}));
