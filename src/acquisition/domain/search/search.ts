/**
 * Search documents shared by every provider. `provider` stays a string so this
 * concept file does not name a source. Adapters fill in the historical names.
 */
export type SearchSourcePolicy = "news" | "authoritative" | "official";

export type SearchInput = {
  query: string;
  count: number;
  day: string;
  sinceDay?: string;
  window?: { since: string; until: string };
  sourcePolicy: SearchSourcePolicy;
};

export type SourceVerification = {
  method: "configured-domain" | "article-read";
  domain: string;
  policy: "official" | "news";
};

export type SearchResult = {
  id: string;
  title: string;
  siteName?: string;
  url: string;
  snippet?: string;
  summary?: string;
  publishTime?: string;
  rankScore?: number;
  authInfoDescription?: string;
  authInfoLevel?: number;
  rankPosition: number;
  sourceVerification?: SourceVerification;
};

export type SearchUsage = {
  source: "network" | "cache";
  fetchedAt: string;
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
};

export type SearchPage = {
  searchUsage?: SearchUsage;
  provider?: string;
  fallback?: SearchFallback;
  logId?: string;
  resultCount: number;
  timeCostMs?: number;
  results: SearchResult[];
};

export type SearchFallback = {
  reason: string;
  searched: boolean;
  reads: number;
  warnings: string[];
  searches?: number;
  incomplete?: boolean;
  sources?: string[];
  skippedSources?: string[];
  rawResults?: number;
  domainRejected?: number;
  invalidLinks?: number;
};

/**
 * One tagged failure for every historical search `code`. Provider codes are an
 * open set, so the discriminant is a single tag and `code` stays a string.
 * The value is an `Error` because audit text reads `message` and rejected
 * promises expose `code`. Provider-specific fields travel in `options` and are
 * copied onto the instance so this concept file does not name a source.
 */
export type SearchFailure = {
  readonly _tag: "SearchFailure";
  readonly code: string;
  readonly message: string;
  readonly retryAfterMs?: number;
};

export class NewsSearchError extends Error implements SearchFailure {
  readonly _tag = "SearchFailure" as const;
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(
    code: string,
    message: string,
    options: { readonly retryAfterMs?: number; readonly [key: string]: unknown } = {},
  ) {
    super(message);
    this.name = "NewsSearchError";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs;
    const extras = options as { readonly retryAfterMs?: number; readonly [key: string]: unknown };
    for (const key of Object.keys(extras)) {
      if (key === "retryAfterMs") continue;
      Object.defineProperty(this, key, {
        value: extras[key],
        enumerable: true,
        writable: true,
      });
    }
  }
}

export function isSearchFailure(value: unknown): value is NewsSearchError {
  if (typeof value !== "object" || value === null) return false;
  const failure = value as { _tag?: unknown; code?: unknown };
  return failure._tag === "SearchFailure" && typeof failure.code === "string";
}

export function editionRotation(day: string, edition: "noon" | "evening"): number {
  return (
    Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) * 2 + (edition === "evening" ? 1 : 0)
  );
}

export function selectQueryIds(
  queryIds: readonly string[],
  rotation: number,
  maxQueries: number,
): ReadonlySet<string> {
  const count = Math.min(maxQueries, queryIds.length);
  return new Set(
    Array.from({ length: count }, (_, offset) => queryIds[(rotation + offset) % queryIds.length]!),
  );
}

/** Same remainder split the hybrid brief used to spread a run's fallback quota. */
export function shareSearchBudget(
  budget: number,
  id: string,
  queryIds: readonly string[] | undefined,
  rotation: number,
): number {
  if (!queryIds?.length) return budget;
  const index = queryIds.indexOf(id);
  if (index < 0) return 0;
  const priority = (index - (rotation % queryIds.length) + queryIds.length) % queryIds.length;
  return Math.floor(budget / queryIds.length) + (priority < budget % queryIds.length ? 1 : 0);
}

export type NewsSearchInput = SearchInput;
export type NewsSearchResult = SearchResult;
export type NewsSearchPage = SearchPage;
