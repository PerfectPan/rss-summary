import type { SearchSettlement } from "../../../acquisition/index.js";
import {
  buildNewsAudit as buildNewsAuditDraft,
  summarizeNewsSources as summarizeNewsSourcesDraft,
  type NewsAuditRequest,
  type NewsBriefAuditDraft,
  type NewsNativeReceipt,
  type NewsQueryAuditDraft,
  type NewsQueryFailure,
  type NewsQueryPage,
  type NewsQuerySettlement,
} from "../../../editorial/index.js";
export type { NewsAuditRequest } from "../../../editorial/index.js";
export type { NewsSourceStatus } from "../../../editorial/index.js";
import type { NewsSourceStatus } from "../../../editorial/index.js";
import type { SearchPage } from "../../../acquisition/index.js";
import type {
  DomainNewsTopic,
  DomainNewsTopicQuery,
  NewsHitDecision,
  NewsStoryDecision,
} from "../../../editorial/index.js";

/**
 * Projections of the news audit for the external JSON structure: the provider
 * receipt field names and the model-caution wording live here so editorial
 * stays source-neutral.
 */
/** JSON key kept for news-topics.json. The concept file does not name the provider. */
export type NewsTopicQuery = DomainNewsTopicQuery & {
  glm?: {
    query: string;
    domains: string[];
    sourceQueries?: Record<string, string>;
  };
};

export type NewsTopic = Omit<DomainNewsTopic, "queries"> & {
  queries: NewsTopicQuery[];
};

export type NewsQueryAudit = Omit<NewsQueryAuditDraft, "receipt"> & {
  grok?: NewsNativeReceipt;
};

export type NewsBriefAudit = Omit<NewsBriefAuditDraft, "queries"> & {
  queries: NewsQueryAudit[];
};

const modelSearchCaution =
  "X 资讯经 Grok 原生搜索和模型整理，未独立核验原文、作者或事实；搜索结果不代表完整时间线";

export function buildNewsAudit(
  requests: readonly NewsAuditRequest[],
  settled: readonly SearchSettlement[],
  decisions: NewsHitDecision[],
  storyDecisions: NewsStoryDecision[],
  deduplicatedStories: number,
  selectedStories: number,
): NewsBriefAudit {
  const draft = buildNewsAuditDraft(
    [...requests],
    settled.map(normalizeSettlement),
    decisions,
    storyDecisions,
    deduplicatedStories,
    selectedStories,
  );
  return { ...draft, queries: draft.queries.map(publishQueryAudit) };
}

export function summarizeNewsSources(
  requests: readonly NewsAuditRequest[],
  settled: readonly SearchSettlement[],
): { sourceStatus: NewsSourceStatus; warnings: string[] } {
  return summarizeNewsSourcesDraft(
    [...requests],
    settled.map(normalizeSettlement),
    modelSearchCaution,
  );
}

function publishQueryAudit(query: NewsQueryAuditDraft): NewsQueryAudit {
  const { receipt, ...rest } = query;
  if (query.status !== "ok") {
    return {
      queryId: query.queryId,
      query: query.query,
      intent: query.intent,
      topicId: query.topicId,
      topicLabel: query.topicLabel,
      status: query.status,
      fetched: query.fetched,
      accepted: query.accepted,
      rejected: query.rejected,
      ...(query.errorCode !== undefined ? { errorCode: query.errorCode } : {}),
      ...(receipt ? { grok: receipt } : {}),
      ...(query.error !== undefined ? { error: query.error } : {}),
    };
  }
  return {
    queryId: rest.queryId,
    query: rest.query,
    intent: rest.intent,
    topicId: rest.topicId,
    topicLabel: rest.topicLabel,
    status: "ok",
    ...(rest.logId ? { logId: rest.logId } : {}),
    ...(rest.provider ? { provider: rest.provider } : {}),
    ...(rest.searchUsage ? { searchUsage: rest.searchUsage } : {}),
    ...(rest.fallback ? { fallback: rest.fallback } : {}),
    ...(receipt ? { grok: receipt } : {}),
    reportedResultCount: rest.reportedResultCount,
    fetched: rest.fetched,
    accepted: rest.accepted,
    rejected: rest.rejected,
  };
}

function normalizeSettlement(settlement: SearchSettlement): NewsQuerySettlement {
  if (settlement._tag === "Fulfilled") {
    const page = settlement.value as SearchPage & { grok?: NewsNativeReceipt };
    const receipt = page.grok ? page.grok : undefined;
    const value: NewsQueryPage = {
      ...(page.provider ? { provider: page.provider } : {}),
      ...(page.searchUsage ? { searchUsage: page.searchUsage } : {}),
      ...(page.fallback ? { fallback: page.fallback } : {}),
      ...(page.logId ? { logId: page.logId } : {}),
      resultCount: page.resultCount,
      results: page.results,
      ...(receipt ? { receipt } : {}),
      ...(page.provider === "grok" ? { modelCompiled: true } : {}),
    };
    return { _tag: "Fulfilled", value };
  }
  const reason = settlement.reason;
  const tagged = isTaggedFailure(reason);
  const failure: NewsQueryFailure = {
    ...(tagged ? { code: reason.code } : {}),
    message: errorText(reason),
    ...(tagged && reason.grok ? { receipt: reason.grok } : {}),
  };
  return { _tag: "Rejected", reason: failure };
}

function isTaggedFailure(value: unknown): value is { code: string; grok?: NewsNativeReceipt } {
  if (typeof value !== "object" || value === null) return false;
  const failure = value as { _tag?: unknown; code?: unknown };
  return failure._tag === "SearchFailure" && typeof failure.code === "string";
}

function errorText(value: unknown): string {
  return Object.prototype.toString.call(value) === "[object Error]"
    ? (value as { message: string }).message
    : String(value);
}
