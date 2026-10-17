import type { SearchFallback, SearchUsage } from "../../../acquisition/domain/search/search.js";
import type {
  NewsHitDecision,
  NewsHitRejectionReason,
  NewsQueryIntent,
  NewsStoryDecision,
  NewsTopic,
  NewsTopicQuery,
} from "./news.js";

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

export function buildNewsAudit(
  requests: NewsAuditRequest[],
  settled: readonly NewsQuerySettlement[],
  decisions: NewsHitDecision[],
  storyDecisions: NewsStoryDecision[],
  deduplicatedStories: number,
  selectedStories: number,
): NewsBriefAuditDraft {
  const queries = requests.map(({ query, topic, input }, index): NewsQueryAuditDraft => {
    const result = settled[index]!;
    const queryDecisions = decisions.filter(({ hit }) => hit.queryId === query.id);
    if (result._tag === "Rejected") {
      const deferred = ["query_deferred", "local_budget_exhausted"].includes(
        result.reason.code ?? "",
      );
      return {
        queryId: query.id,
        query: input?.query ?? query.text,
        intent: query.intent,
        topicId: topic.id,
        topicLabel: topic.label,
        status: result.reason.code !== undefined && deferred ? "skipped" : "failed",
        fetched: 0,
        accepted: 0,
        rejected: {},
        ...(result.reason.code !== undefined ? { errorCode: result.reason.code } : {}),
        ...(result.reason.receipt ? { receipt: result.reason.receipt } : {}),
        error: result.reason.message,
      };
    }
    return {
      queryId: query.id,
      query: input?.query ?? query.text,
      intent: query.intent,
      topicId: topic.id,
      topicLabel: topic.label,
      status: "ok",
      ...(result.value.logId ? { logId: result.value.logId } : {}),
      ...(result.value.provider ? { provider: result.value.provider } : {}),
      ...(result.value.searchUsage ? { searchUsage: result.value.searchUsage } : {}),
      ...(result.value.fallback ? { fallback: result.value.fallback } : {}),
      ...(result.value.receipt ? { receipt: result.value.receipt } : {}),
      reportedResultCount: result.value.resultCount,
      fetched: result.value.results.length,
      accepted: queryDecisions.filter(({ status }) => status === "accepted").length,
      rejected: rejectionCounts(queryDecisions),
    };
  });
  const acceptedHits = decisions.filter(({ status }) => status === "accepted").length;
  return {
    queries,
    counts: {
      fetched: decisions.length,
      acceptedHits,
      rejectedHits: decisions.length - acceptedHits,
      canonicalDuplicates: acceptedHits - deduplicatedStories,
      deduplicatedStories,
      selectedStories,
      duplicateTitleStories: countStoryReason(storyDecisions, "duplicate-title"),
      topicQuotaFilteredStories: countStoryReason(storyDecisions, "topic-quota"),
      briefCapFilteredStories: countStoryReason(storyDecisions, "brief-cap"),
    },
  };
}

function rejectionCounts(
  decisions: NewsHitDecision[],
): Partial<Record<NewsHitRejectionReason, number>> {
  const counts: Partial<Record<NewsHitRejectionReason, number>> = {};
  for (const decision of decisions) {
    if (decision.status !== "rejected" || !decision.reason) continue;
    counts[decision.reason] = (counts[decision.reason] ?? 0) + 1;
  }
  return counts;
}

function countStoryReason(
  decisions: NewsStoryDecision[],
  reason: NonNullable<NewsStoryDecision["reason"]>,
): number {
  return decisions.filter((decision) => decision.reason === reason).length;
}

export type NewsSourceStatus = {
  state: "healthy" | "recovered" | "partial" | "unavailable";
  queries: number;
  completed: number;
  recovered: number;
  incompleteTopics: string[];
  notes: string[];
};

export function summarizeNewsSources(
  requests: NewsAuditRequest[],
  settled: readonly NewsQuerySettlement[],
  modelCaution?: string,
): { sourceStatus: NewsSourceStatus; warnings: string[] } {
  const completed = settled.filter((result) => result._tag === "Fulfilled").length;
  const recovered = settled.filter(
    (result) =>
      result._tag === "Fulfilled" &&
      result.value.fallback?.searched &&
      !result.value.fallback.incomplete &&
      !["no-eligible-results", "complement"].includes(result.value.fallback.reason),
  ).length;
  const incompleteTopics = [
    ...new Set(
      requests
        .filter((_, index) => {
          const result = settled[index]!;
          return (
            result._tag === "Rejected" ||
            result.value.fallback?.incomplete ||
            result.value.searchUsage?.source === "cache"
          );
        })
        .map(({ topic }) => topic.label),
    ),
  ];
  const state =
    completed === 0
      ? "unavailable"
      : incompleteTopics.length
        ? "partial"
        : recovered
          ? "recovered"
          : "healthy";
  const sourcePlans = settled.flatMap((result) =>
    result._tag === "Fulfilled" && result.value.fallback ? [result.value.fallback] : [],
  );
  const searchedSources = sourcePlans.reduce(
    (total, plan) => total + (plan.sources?.length ?? 0),
    0,
  );
  const deferredSources = sourcePlans.reduce(
    (total, plan) => total + (plan.skippedSources?.length ?? 0),
    0,
  );
  const notes = recovered ? [`${recovered} 个查询已由备用来源完成；不代表覆盖全部新闻`] : [];
  const deferred = settled.filter(
    (result) => result._tag === "Rejected" && result.reason.code === "query_deferred",
  ).length;
  const limited = settled.filter(
    (result) => result._tag === "Rejected" && result.reason.code === "local_budget_exhausted",
  ).length;
  const cached = settled.flatMap((result) =>
    result._tag === "Fulfilled" && result.value.searchUsage?.source === "cache"
      ? [result.value.searchUsage.fetchedAt]
      : [],
  );
  if (deferred)
    notes.push(
      `按预算轮换查询，本轮执行至多 ${requests.length - deferred}/${requests.length} 组，其余 ${deferred} 组延后`,
    );
  if (limited) notes.push(`搜索请求预算已用完，${limited} 组未刷新；未转用其他付费搜索`);
  if (cached.length)
    notes.push(
      `复用 ${cached.length} 组搜索缓存，最早采集于 ${cached.sort()[0]}；不代表此后没有更新`,
    );
  if (deferredSources)
    notes.push(
      `本轮按预算轮换检索 ${searchedSources} 组官网查询，另 ${deferredSources} 组留待后续轮次`,
    );
  const modelNotes =
    modelCaution &&
    settled.some((result) => result._tag === "Fulfilled" && result.value.modelCompiled)
      ? [modelCaution]
      : [];
  notes.push(...modelNotes);
  return {
    sourceStatus: {
      state,
      queries: requests.length,
      completed,
      recovered,
      incompleteTopics,
      notes,
    },
    warnings:
      state === "unavailable"
        ? [
            limited
              ? "搜索预算已用完，无法判断本期是否有新增资讯"
              : "资讯采集失败，无法判断本期是否有新增资讯",
            ...notes,
          ]
        : state === "partial"
          ? [`采集覆盖不完整：${incompleteTopics.join("、")}；详见采集审计`, ...notes]
          : modelNotes,
  };
}
