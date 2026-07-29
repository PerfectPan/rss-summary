import type { DoubaoSearchResult } from "./doubao-search.js";
import type { NewsSourcePolicy, NewsTopic } from "./news-topics.js";

export type NewsSearchHit = DoubaoSearchResult & {
  topicId: string;
  topicLabel: string;
  sourcePolicy: NewsSourcePolicy;
  query: string;
};

export type NewsStory = {
  id: string;
  title: string;
  canonicalUrl: string;
  summary: string;
  siteName: string;
  publishTime: string;
  rankScore: number;
  authInfoLevel: number;
  authInfoDescription?: string;
  topicIds: string[];
  topicLabels: string[];
  queries: string[];
  queryHits: number;
  score: number;
};

export type SelectedNewsStory = NewsStory & {
  selectedTopicId: string;
};

export type NewsTimeWindow = {
  since: number;
  until: number;
  timezoneOffset?: string;
};

export function buildNewsStories(hits: NewsSearchHit[], window: NewsTimeWindow): NewsStory[] {
  const groups = new Map<string, NewsSearchHit[]>();
  for (const hit of hits) {
    if (!isAcceptedHit(hit, window)) continue;
    const canonicalUrl = canonicalizeUrl(hit.url);
    if (!canonicalUrl) continue;
    const current = groups.get(canonicalUrl) ?? [];
    current.push(hit);
    groups.set(canonicalUrl, current);
  }

  return [...groups.entries()]
    .map(([canonicalUrl, matches]) => toStory(canonicalUrl, matches))
    .sort((left, right) => right.score - left.score || right.publishTime.localeCompare(left.publishTime));
}

export function selectNewsStories(stories: NewsStory[], topics: NewsTopic[]): SelectedNewsStory[] {
  const selected: SelectedNewsStory[] = [];
  const selectedUrls = new Set<string>();
  for (const topic of topics.filter(({ enabled }) => enabled)) {
    const matches = stories.filter(
      (story) => story.topicIds.includes(topic.id) && !selectedUrls.has(story.canonicalUrl),
    );
    let count = 0;
    for (const story of matches) {
      if (count >= topic.maxItems || selectedUrls.has(story.canonicalUrl)) continue;
      if (selected.some((candidate) => isSameNewsEvent(candidate, story))) continue;
      selected.push({ ...story, selectedTopicId: topic.id });
      selectedUrls.add(story.canonicalUrl);
      count += 1;
    }
  }
  return selected;
}

function isAcceptedHit(hit: NewsSearchHit, window: NewsTimeWindow): boolean {
  if (!hit.title.trim() || !hit.url.trim()) return false;
  const publishedAt = hit.publishTime
    ? parseNewsPublishTime(hit.publishTime, window.timezoneOffset)
    : Number.NaN;
  if (!Number.isFinite(publishedAt) || publishedAt < window.since || publishedAt >= window.until) return false;
  const authLevel = hit.authInfoLevel ?? 4;
  if (hit.sourcePolicy === "official") return authLevel === 1;
  return authLevel <= 2;
}

export function parseNewsPublishTime(value: string, timezoneOffset?: string): number {
  const normalized = value.trim().replace(" ", "T");
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(normalized);
  return Date.parse(!hasExplicitZone && timezoneOffset ? `${normalized}${timezoneOffset}` : normalized);
}

function toStory(canonicalUrl: string, matches: NewsSearchHit[]): NewsStory {
  const representative = [...matches].sort(
    (left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0),
  )[0]!;
  const queries = unique(matches.map(({ query }) => query));
  const topicIds = unique(matches.map(({ topicId }) => topicId));
  const topicLabels = unique(matches.map(({ topicLabel }) => topicLabel));
  const authInfoLevel = Math.min(...matches.map(({ authInfoLevel }) => authInfoLevel ?? 4));
  const rankScore = Math.max(...matches.map(({ rankScore }) => rankScore ?? 0));
  const queryHits = queries.length;
  const authorityScore = authInfoLevel === 1 ? 25 : authInfoLevel === 2 ? 15 : 0;
  return {
    id: representative.id,
    title: representative.title.trim(),
    canonicalUrl,
    summary: compactSummary(
      representative.summary ?? representative.snippet ?? "暂无可用摘要。",
      representative.title,
      representative.siteName,
    ),
    siteName: representative.siteName?.trim() || new URL(canonicalUrl).hostname,
    publishTime: representative.publishTime!,
    rankScore,
    authInfoLevel,
    authInfoDescription: representative.authInfoDescription,
    topicIds,
    topicLabels,
    queries,
    queryHits,
    score: Math.round(rankScore * 100 + authorityScore + Math.max(0, queryHits - 1) * 20),
  };
}

export function canonicalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/iu.test(key) || ["from", "source", "ref", "spm"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/u, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

function compactSummary(value: string, title: string, siteName: string | undefined): string {
  let normalized = value.replace(/\s+/gu, " ").trim();
  normalized = stripLeadingLiteral(normalized, title);
  normalized = stripLeadingLiteral(normalized, siteName);
  normalized = normalized.replace(/^20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*/u, "");
  normalized = stripLeadingLiteral(normalized, title);
  normalized = normalized.replace(/^[：:·|—–\-，,。；;\s]+/u, "");

  const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/gu) ?? [];
  const summary = sentences.slice(0, 2).join("").trim() || "暂无可用摘要。";
  return summary.length <= 110 ? summary : `${summary.slice(0, 109).trimEnd()}…`;
}

function stripLeadingLiteral(value: string, literal: string | undefined): string {
  const prefix = literal?.replace(/\s+/gu, " ").trim();
  if (!prefix || !value.startsWith(prefix)) return value;
  return value.slice(prefix.length).replace(/^[：:·|—–\-，,。；;\s]+/u, "");
}

function isSameNewsEvent(left: NewsStory, right: NewsStory): boolean {
  const leftFeatures = titleFeatures(left.title);
  const rightFeatures = titleFeatures(right.title);
  const smallerSize = Math.min(leftFeatures.size, rightFeatures.size);
  if (smallerSize < 4) return false;

  let shared = 0;
  for (const feature of leftFeatures) {
    if (rightFeatures.has(feature)) shared += 1;
  }
  return shared >= 4 && shared / smallerSize >= 0.6;
}

const genericTitleFeatures = new Set([
  "about",
  "from",
  "important",
  "latest",
  "news",
  "the",
  "update",
  "with",
  "今日",
  "发布",
  "完成",
  "宣布",
  "新闻",
  "最新",
  "消息",
  "用户",
  "重要",
  "注意",
]);

function titleFeatures(value: string): Set<string> {
  const normalized = value.normalize("NFKC").toLowerCase();
  const features = new Set<string>();
  for (const match of normalized.matchAll(/\p{Script=Han}+/gu)) {
    const text = match[0];
    for (let index = 0; index < text.length - 1; index += 1) {
      const feature = text.slice(index, index + 2);
      if (!genericTitleFeatures.has(feature)) features.add(feature);
    }
  }
  for (const match of normalized.matchAll(/[a-z0-9]+(?:[.+-][a-z0-9]+)*/gu)) {
    const feature = match[0];
    if (feature.length >= 2 && !genericTitleFeatures.has(feature)) features.add(feature);
  }
  return features;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
