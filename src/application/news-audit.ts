import type {
  NewsHitDecision,
  NewsHitRejectionReason,
  NewsQueryIntent,
  NewsStoryDecision,
  NewsTopic,
  NewsTopicQuery,
} from "../domain/news.js";
import type { DoubaoSearchPage } from "../infrastructure/doubao-search.js";

export type NewsQueryAudit = {
  queryId: string;
  query: string;
  intent: NewsQueryIntent;
  topicId: string;
  topicLabel: string;
  status: "ok" | "failed";
  logId?: string;
  reportedResultCount?: number;
  fetched: number;
  accepted: number;
  rejected: Partial<Record<NewsHitRejectionReason, number>>;
  error?: string;
};

export type NewsBriefAudit = {
  queries: NewsQueryAudit[];
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

export type NewsAuditRequest = { query: NewsTopicQuery; topic: NewsTopic };

export function buildNewsAudit(
  requests: NewsAuditRequest[],
  settled: PromiseSettledResult<DoubaoSearchPage>[],
  decisions: NewsHitDecision[],
  storyDecisions: NewsStoryDecision[],
  deduplicatedStories: number,
  selectedStories: number,
): NewsBriefAudit {
  const queries = requests.map(({ query, topic }, index): NewsQueryAudit => {
    const result = settled[index]!;
    const queryDecisions = decisions.filter(({ hit }) => hit.queryId === query.id);
    if (result.status === "rejected") {
      return {
        queryId: query.id,
        query: query.text,
        intent: query.intent,
        topicId: topic.id,
        topicLabel: topic.label,
        status: "failed",
        fetched: 0,
        accepted: 0,
        rejected: {},
        error: errorText(result.reason),
      };
    }
    return {
      queryId: query.id,
      query: query.text,
      intent: query.intent,
      topicId: topic.id,
      topicLabel: topic.label,
      status: "ok",
      ...(result.value.logId ? { logId: result.value.logId } : {}),
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

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
