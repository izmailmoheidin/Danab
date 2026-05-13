type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_MAX_ENTRIES = 500;

export class CacheComponent {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  private pruneExpired(now: number): void {
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private enforceLimit(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.entries.delete(oldestKey);
    }
  }

  get<T>(key: string): T | undefined {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    const now = Date.now();
    this.pruneExpired(now);
    this.entries.set(key, {
      value,
      expiresAt: now + ttlMs,
    });
    this.enforceLimit();
  }

  async remember<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const active = this.inFlight.get(key);
    if (active) return active as Promise<T>;

    const request = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request as Promise<unknown>);
    return request;
  }

  invalidate(key: string): boolean {
    this.inFlight.delete(key);
    return this.entries.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;

    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }

    for (const key of Array.from(this.inFlight.keys())) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    }

    return removed;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}

const globalForCache = globalThis as typeof globalThis & {
  _cacheComponent?: CacheComponent;
};

export const cacheComponent =
  globalForCache._cacheComponent ??
  (globalForCache._cacheComponent = new CacheComponent());

export function buildPrivateCacheControl(ttlMs: number): string {
  const maxAge = Math.max(1, Math.floor(ttlMs / 1000));
  const staleWhileRevalidate = Math.max(maxAge, Math.floor(maxAge / 2));
  return `private, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}
