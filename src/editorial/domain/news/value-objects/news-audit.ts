import type { SearchFallback, SearchUsage } from "../../../../acquisition/domain/search/index.js";
import type { NewsHitRejectionReason, NewsQueryIntent, NewsTopic, NewsTopicQuery } from "./news.js";

/** Native-search receipt. The public audit key is applied by the module entry. */
export type NewsNativeReceipt = {
  nativeTools: string[];
  nativeCallCount?: number;
  elapsedMs?: number;
  rejectedResults: number;
  costUsd?: number;
  totalTokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
};

export type NewsQueryPage = {
  provider?: string;
  searchUsage?: SearchUsage;
  fallback?: SearchFallback;
  logId?: string;
  resultCount: number;
  results: readonly unknown[];
  receipt?: NewsNativeReceipt;
  /** Set by the module entry when the page was compiled by a model search. */
  modelCompiled?: boolean;
};

export type NewsQueryFailure = {
  code?: string;
  message: string;
  receipt?: NewsNativeReceipt;
};

export type NewsQuerySettlement =
  | { readonly _tag: "Fulfilled"; readonly value: NewsQueryPage }
  | { readonly _tag: "Rejected"; readonly reason: NewsQueryFailure };

export type NewsQueryAuditDraft = {
  queryId: string;
  query: string;
  intent: NewsQueryIntent;
  topicId: string;
  topicLabel: string;
  status: "ok" | "failed" | "skipped";
  provider?: NewsQueryPage["provider"];
  searchUsage?: NewsQueryPage["searchUsage"];
  fallback?: NewsQueryPage["fallback"];
  logId?: string;
  reportedResultCount?: number;
  fetched: number;
  accepted: number;
  rejected: Partial<Record<NewsHitRejectionReason, number>>;
  errorCode?: string;
  error?: string;
  receipt?: NewsNativeReceipt;
};

export type NewsBriefAuditDraft = {
  queries: NewsQueryAuditDraft[];
  counts: {
    fetched: number;
    acceptedHits: number;
    rejectedHits: number;
    canonicalDuplicates: number;
    deduplicatedStories: number;
    selectedStories: number;
    duplicateTitleStories: number;
    topicQuotaFilteredStories: number;
    briefCapFilteredStories: number;
  };
};

export type NewsAuditRequest = {
  query: NewsTopicQuery;
  topic: NewsTopic;
  input?: { query: string };
};

export type NewsSourceStatus = {
  state: "healthy" | "recovered" | "partial" | "unavailable";
  queries: number;
  completed: number;
  recovered: number;
  incompleteTopics: string[];
  notes: string[];
};
