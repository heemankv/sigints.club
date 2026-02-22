/**
 * TapestryCache — in-memory TTL cache with stale-while-revalidate and background polling.
 *
 * Three usage patterns:
 *
 *   wrap(key, ttl, fn)         — block on miss, serve fresh on hit (cache-aside)
 *   swr(key, ttl, fn)          — serve stale immediately + refresh async; block only on cold start
 *   startPoller(key, ...)      — proactively keep a key warm in the background
 *
 *   invalidate(key)            — clear a single key (and its stale copy)
 *   invalidatePrefix(prefix)   — clear all matching keys (and their stale copies)
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

type Poller = {
  intervalId: NodeJS.Timeout;
};

export class TapestryCache {
  private store  = new Map<string, CacheEntry<unknown>>();
  private stale  = new Map<string, unknown>();   // last known-good value, kept indefinitely
  private inflight = new Set<string>();          // keys with a background refresh in progress
  private pollers = new Map<string, Poller>();

  // ─── Core get / set ──────────────────────────────────────────────────────

  /** Return a fresh (non-expired) cached value, or null. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /** Store a value with an explicit TTL (ms). Also updates the stale copy. */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
    this.stale.set(key, data);
  }

  // ─── Invalidation ────────────────────────────────────────────────────────

  /** Remove a single key and its stale copy. Forces next request to re-fetch. */
  invalidate(key: string): void {
    this.store.delete(key);
    this.stale.delete(key);
  }

  /** Remove all keys matching a prefix and their stale copies. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    for (const key of this.stale.keys()) {
      if (key.startsWith(prefix)) this.stale.delete(key);
    }
  }

  // ─── Cache-aside (blocking) ───────────────────────────────────────────────

  /**
   * Classic cache-aside: return fresh cached value if available, otherwise
   * call `fn`, store the result, and return it. Always blocks on a miss.
   */
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fn();
    this.set(key, data, ttlMs);
    return data;
  }

  // ─── Stale-While-Revalidate ───────────────────────────────────────────────

  /**
   * Stale-While-Revalidate:
   * - Fresh cache hit  → return immediately (no fetch).
   * - Stale but exists → return stale immediately, kick off async refresh
   *                      (deduplicated — only one refresh per key at a time).
   * - Cold start       → fetch synchronously (only happens on first-ever request
   *                      or after an explicit invalidate()).
   */
  async swr<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const fresh = this.get<T>(key);
    if (fresh !== null) return fresh;

    const staleValue = this.stale.get(key) as T | undefined;
    if (staleValue !== undefined) {
      // Return stale data immediately and refresh in the background.
      if (!this.inflight.has(key)) {
        this.inflight.add(key);
        void fn()
          .then((data) => this.set(key, data, ttlMs))
          .catch(() => { /* keep stale on error */ })
          .finally(() => this.inflight.delete(key));
      }
      return staleValue;
    }

    // Cold start: nothing cached yet — must fetch synchronously.
    const data = await fn();
    this.set(key, data, ttlMs);
    return data;
  }

  // ─── Background polling ───────────────────────────────────────────────────

  /**
   * Start a background poller that proactively refreshes `key` every
   * `intervalMs` ms and stores the result with `ttlMs` TTL.
   *
   * - Immediately fires an initial fetch on registration.
   * - On error, keeps the existing (stale) cache entry intact.
   * - Calling `startPoller` with the same key twice is a no-op.
   */
  startPoller(
    key: string,
    intervalMs: number,
    ttlMs: number,
    fn: () => Promise<unknown>
  ): void {
    if (this.pollers.has(key)) return;

    // Fire immediately so the cache is warm before the first request arrives.
    fn()
      .then((data) => this.set(key, data, ttlMs))
      .catch(() => {
        // Silently ignore initial fetch failure — will retry on schedule.
      });

    const intervalId = setInterval(async () => {
      try {
        const data = await fn();
        this.set(key, data, ttlMs);
      } catch {
        // Keep stale data on error so the API stays available.
      }
    }, intervalMs);

    this.pollers.set(key, { intervalId });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Stop all pollers and clear everything. Call on server shutdown. */
  stopAll(): void {
    for (const { intervalId } of this.pollers.values()) {
      clearInterval(intervalId);
    }
    this.pollers.clear();
    this.store.clear();
    this.stale.clear();
    this.inflight.clear();
  }

  /** Number of live (non-expired) keys — useful for health checks / logging. */
  size(): number {
    let live = 0;
    const now = Date.now();
    for (const entry of this.store.values()) {
      if (entry.expiresAt > now) live++;
    }
    return live;
  }
}

export const tapestryCache = new TapestryCache();
