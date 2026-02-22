/**
 * TapestryCache — in-memory TTL cache with optional background polling.
 *
 * Usage:
 *   tapestryCache.wrap("key", 20_000, () => expensiveFetch())  // cache-aside
 *   tapestryCache.startPoller("key", 15_000, 20_000, fn)       // proactive refresh
 *   tapestryCache.invalidate("key")                            // on write
 *   tapestryCache.invalidatePrefix("feed:")                    // on new post
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

type Poller = {
  intervalId: NodeJS.Timeout;
};

export class TapestryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private pollers = new Map<string, Poller>();

  /** Return cached value, or null if missing/expired. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /** Store a value with an explicit TTL (milliseconds). */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /** Remove a single key. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Remove all keys that start with a given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /**
   * Cache-aside helper: return the cached value if present, otherwise call
   * `fn`, store the result, and return it.
   */
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fn();
    this.set(key, data, ttlMs);
    return data;
  }

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

  /** Stop all pollers and clear the entire store. Call on server shutdown. */
  stopAll(): void {
    for (const { intervalId } of this.pollers.values()) {
      clearInterval(intervalId);
    }
    this.pollers.clear();
    this.store.clear();
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
