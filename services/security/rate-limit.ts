interface Bucket {
  count: number;
  resetAt: number;
}

const globalBuckets = globalThis as unknown as { __mathglassRateBuckets?: Map<string, Bucket> };
const buckets = globalBuckets.__mathglassRateBuckets ?? new Map<string, Bucket>();
globalBuckets.__mathglassRateBuckets = buckets;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Best-effort per-instance rate limiting. Production multi-instance
 * deployments should also configure provider quotas and an edge rate limiter.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const current = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= current) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds: 0 };
}
