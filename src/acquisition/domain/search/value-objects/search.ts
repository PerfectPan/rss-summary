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

export type NewsSearchInput = SearchInput;
export type NewsSearchResult = SearchResult;
export type NewsSearchPage = SearchPage;
