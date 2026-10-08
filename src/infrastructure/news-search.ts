import type { NewsSourcePolicy, NewsSourceVerification } from "../domain/news.js";

export type NewsSearchInput = {
  query: string;
  count: number;
  day: string;
  sinceDay?: string;
  sourcePolicy: NewsSourcePolicy;
};

export type NewsSearchResult = {
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
  sourceVerification?: NewsSourceVerification;
};

export type NewsSearchPage = {
  searchUsage?: {
    source: "network" | "cache";
    fetchedAt: string;
    dailyUsed: number;
    monthlyUsed: number;
    dailyLimit: number;
    monthlyLimit: number;
  };
  provider?: "doubao" | "glm" | "mixed" | "grok";
  grok?: GrokSearchAudit;
  fallback?: {
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
  logId?: string;
  resultCount: number;
  timeCostMs?: number;
  results: NewsSearchResult[];
};

type GrokSearchAudit = {
  nativeTools: string[];
  rejectedResults: number;
  costUsd?: number;
  totalTokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
};

export class NewsSearchError extends Error {
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(code: string, message: string, options: { retryAfterMs?: number } = {}) {
    super(message);
    this.name = "NewsSearchError";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs;
  }
}
