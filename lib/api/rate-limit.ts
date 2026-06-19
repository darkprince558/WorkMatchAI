import { NextResponse } from 'next/server';
import { isSupabasePersistenceConfigured, supabaseRestRequest } from '@/lib/db/supabase-rest';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitGlobal = typeof globalThis & {
  __workmatchRateLimits?: Map<string, RateLimitBucket>;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export async function checkRateLimit(key: string, options: RateLimitOptions) {
  if (isSupabasePersistenceConfigured()) {
    return checkSupabaseRateLimit(key, options).catch(() => checkMemoryRateLimit(key, options));
  }

  return checkMemoryRateLimit(key, options);
}

function checkMemoryRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const buckets = getBuckets();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    pruneBuckets(buckets, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    allowed: bucket.count <= options.limit,
    retryAfterSeconds,
  };
}

async function checkSupabaseRateLimit(key: string, options: RateLimitOptions) {
  const result = await supabaseRestRequest<Array<{ allowed: boolean; retry_after_seconds: number }>>(
    'rpc/workmatch_check_rate_limit',
    {
      method: 'POST',
      body: JSON.stringify({
        rate_limit_key: key,
        limit_count: options.limit,
        window_ms: options.windowMs,
      }),
    }
  );
  const row = result[0];
  return {
    allowed: Boolean(row?.allowed),
    retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds ?? 0)),
  };
}

export function getClientIp(request: Request) {
  if (process.env.WORKMATCH_TRUST_PROXY_HEADERS !== 'true' && process.env.VERCEL !== '1') {
    return 'local';
  }

  const candidates = [
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    request.headers.get('x-forwarded-for')?.split(',')[0],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeClientIp(candidate);
    if (normalized) return normalized;
  }

  return 'local';
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}

function getBuckets() {
  const workMatchGlobal = globalThis as RateLimitGlobal;
  workMatchGlobal.__workmatchRateLimits ??= new Map();
  return workMatchGlobal.__workmatchRateLimits;
}

function pruneBuckets(buckets: Map<string, RateLimitBucket>, now: number) {
  if (buckets.size < 1000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function normalizeClientIp(value?: string | null) {
  const normalized = value?.trim().replace(/^\[|\]$/g, '');
  if (!normalized || normalized.length > 128) return undefined;
  if (!/^[a-f0-9:.]+$/i.test(normalized)) return undefined;
  return normalized;
}
