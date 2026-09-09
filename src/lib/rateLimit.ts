// In-memory token-bucket rate limiter. Fine for a single instance; swap the Map
// for Redis (or Upstash) when running more than one process. Keyed by user id.

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; retryAfterSec: number; remaining: number };

export function rateLimit(
  key: string,
  opts: { capacity: number; refillPerSec: number } = { capacity: 12, refillPerSec: 0.2 },
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  const elapsed = (now - b.updated) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * opts.refillPerSec);
  b.updated = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / opts.refillPerSec), remaining: 0 };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, retryAfterSec: 0, remaining: Math.floor(b.tokens) };
}

// periodic cleanup so the Map doesn't grow unbounded
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of buckets) if (v.updated < cutoff) buckets.delete(k);
  }, 10 * 60 * 1000).unref?.();
}
