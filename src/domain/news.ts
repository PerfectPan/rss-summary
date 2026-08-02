import { canonicalizeUrl, compactSummary, isSameTitleEvent, parsePublishTime } from "./text.js";

export type NewsSourcePolicy = "authoritative" | "official";

export type NewsBriefEdition = "noon" | "evening";

export type NewsTopic = {
  id: string;
  label: string;
  enabled: boolean;
  sourcePolicy: NewsSourcePolicy;
  maxItems: number;
  queries: string[];
};

export type NewsSearchHit = {
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

const maxNewsBriefItems = 8;

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
    .sort(
      (left, right) =>
        right.score - left.score || right.publishTime.localeCompare(left.publishTime),
    );
}

export function selectNewsStories(stories: NewsStory[], topics: NewsTopic[]): SelectedNewsStory[] {
  const selected: SelectedNewsStory[] = [];
  const selectedUrls = new Set<string>();
  for (const topic of topics.filter(({ enabled }) => enabled)) {
    if (selected.length >= maxNewsBriefItems) break;
    const matches = stories.filter(
      (story) => story.topicIds.includes(topic.id) && !selectedUrls.has(story.canonicalUrl),
    );
    let count = 0;
    for (const story of matches) {
      if (count >= topic.maxItems || selected.length >= maxNewsBriefItems) break;
      if (selectedUrls.has(story.canonicalUrl)) continue;
      if (selected.some((candidate) => isSameTitleEvent(candidate, story))) continue;
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
    ? parsePublishTime(hit.publishTime, window.timezoneOffset)
    : Number.NaN;
  if (!Number.isFinite(publishedAt) || publishedAt < window.since || publishedAt >= window.until)
    return false;
  const authLevel = hit.authInfoLevel ?? 4;
  if (hit.sourcePolicy === "official") return authLevel === 1;
  return authLevel <= 2;
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
