import type { PublicationDay } from "../../../../kernel/index.js";

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
  /**
   * Present when the provider reports only a calendar day in a known timezone.
   * `publishTime` then carries that day (YYYY-MM-DD) instead of an instant.
   */
  publishDay?: PublicationDay;
  rankScore?: number;
  authInfoDescription?: string;
  authInfoLevel?: number;
  /**
   * Provider authority score on a 0–4 scale where 3 and above is high
   * authority and -1 is unknown. Independent of `authInfoLevel`; adapters
   * whose provider publishes such a score set only this field.
   */
  authority?: number;
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

/** Why a query switched providers: the primary provider's failure code. */
export type ProviderFallback = { readonly triggeredBy: string };

export type SearchPage = {
  searchUsage?: SearchUsage;
  provider?: string;
  fallback?: SearchFallback;
  /** Present when a fallback provider answered because the primary failed. */
  providerFallback?: ProviderFallback;
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

export type NewsSearchInput = SearchInput;
export type NewsSearchResult = SearchResult;
export type NewsSearchPage = SearchPage;
