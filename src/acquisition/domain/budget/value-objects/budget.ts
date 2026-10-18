import type { SearchPage, SearchSourcePolicy, SearchResult } from "../../search/index.js";

/** The persisted allowance counters. Prior days stay so a rollback cannot reopen a spent allowance. */
export type BudgetState = {
  version: 1;
  timezoneOffset: string;
  daily: Record<string, number>;
  cache: Record<string, CacheEntry>;
};

export type BudgetLimits = {
  dailyLimit: number;
  monthlyLimit: number;
  timezoneOffset: string;
  cacheTtlMs: number;
};

export type BudgetUsage = {
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
};

export type CachedPage = {
  provider?: string;
  logId?: string;
  resultCount: number;
  timeCostMs?: number;
  results: SearchResult[];
};

export type CacheRequest = {
  provider: string;
  query: string;
  count: number;
  day: string;
  sinceDay: string;
  sourcePolicy: SearchSourcePolicy;
  window?: { since: string; until: string };
};

export type CacheEntry = {
  request: CacheRequest;
  fetchedAt: string;
  page: CachedPage;
};

export type PresentCache = (entry: CacheEntry, usage: BudgetUsage) => SearchPage;

export type HashText = (material: string) => string;

export type Reservation = {
  usage: BudgetUsage;
  cached?: SearchPage;
};

export function cacheKeyMaterial(request: CacheRequest): string {
  return JSON.stringify([
    request.provider,
    request.query,
    request.count,
    request.day,
    request.sinceDay,
    request.sourcePolicy,
    ...(request.window ? [request.window.since, request.window.until] : []),
  ]);
}

export function cacheKey(request: CacheRequest, hash: HashText): string {
  return hash(cacheKeyMaterial(request));
}
