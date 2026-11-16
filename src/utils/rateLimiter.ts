export interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

export class RedirectCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  public hits = 0;
  public misses = 0;

  constructor(maxEntries = 1000, defaultTtlMs = 300_000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string, nowMs: number = Date.now()): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAtMs <= nowMs) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Refresh LRU position
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = this.defaultTtlMs, nowMs: number = Date.now()): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAtMs: nowMs + Math.max(1000, ttlMs),
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }

  hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 100 : Math.round((this.hits / total) * 100);
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60_000, maxRequests = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(key: string, nowMs: number = Date.now()): RateLimitDecision {
    const cutoff = nowMs - this.windowMs;
    const timestamps = (this.windows.get(key) || []).filter((ts) => ts > cutoff);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0];
      this.windows.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetAfterMs: Math.max(1, oldest + this.windowMs - nowMs),
      };
    }

    timestamps.push(nowMs);
    this.windows.set(key, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
      resetAfterMs: this.windowMs,
    };
  }
}
