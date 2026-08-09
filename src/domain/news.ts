import uniq from "lodash-es/uniq.js";

import { canonicalizeUrl, compactSummary, isSameTitleEvent, parsePublishTime } from "./text.js";

export type NewsSourcePolicy = "authoritative" | "official";

export type NewsBriefEdition = "noon" | "evening";

export type NewsQueryIntent =
  | "model-release"
  | "developer-change"
  | "service-incident"
  | "security-advisory"
  | "policy-action"
  | "capital-event";

export type NewsTopicQuery = {
  id: string;
  text: string;
  intent: NewsQueryIntent;
  subjectAny: string[];
  eventAny: string[];
  excludedAny: string[];
};

export type NewsTopic = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  sourcePolicy: NewsSourcePolicy;
  maxItems: number;
  queries: NewsTopicQuery[];
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
  queryId: string;
  queryText: string;
  subjectAny: string[];
  eventAny: string[];
  excludedAny: string[];
  rankPosition: number;
};

export type NewsScoreBreakdown = {
  rank: number;
  authority: number;
  freshness: number;
  crossQuery: number;
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
  queryIds: string[];
  queries: string[];
  queryHits: number;
  scoreBreakdown: NewsScoreBreakdown;
  score: number;
};

export type SelectedNewsStory = NewsStory & {
  selectedTopicId: string;
};

export type NewsStorySelectionReason =
  | "duplicate-title"
  | "topic-quota"
  | "brief-cap"
  | "no-enabled-topic";

export type NewsStoryDecision = {
  story: NewsStory;
  status: "selected" | "filtered";
  reason?: NewsStorySelectionReason;
};

export type NewsStorySelectionResult = {
  stories: SelectedNewsStory[];
  decisions: NewsStoryDecision[];
};

export type NewsTimeWindow = {
  since: number;
  until: number;
  timezoneOffset?: string;
};

export type NewsHitRejectionReason =
  | "missing-fields"
  | "invalid-publish-time"
  | "outside-window"
  | "insufficient-authority"
  | "excluded-content"
  | "subject-mismatch"
  | "intent-mismatch"
  | "invalid-url";

export type NewsHitDecision = {
  hit: NewsSearchHit;
  status: "accepted" | "rejected";
  reason?: NewsHitRejectionReason;
  canonicalUrl?: string;
};

export type NewsStoryBuildResult = {
  stories: NewsStory[];
  decisions: NewsHitDecision[];
};

const maxNewsBriefItems = 8;

export function buildNewsStories(hits: NewsSearchHit[], window: NewsTimeWindow): NewsStory[] {
  return buildNewsStoriesWithAudit(hits, window).stories;
}

export function buildNewsStoriesWithAudit(
  hits: NewsSearchHit[],
  window: NewsTimeWindow,
): NewsStoryBuildResult {
  const groups = new Map<string, NewsSearchHit[]>();
  const decisions: NewsHitDecision[] = [];
  for (const hit of hits) {
    const reason = rejectionReasonForHit(hit, window);
    if (reason) {
      decisions.push({ hit, status: "rejected", reason });
      continue;
    }
    const canonicalUrl = canonicalizeUrl(hit.url);
    if (!canonicalUrl) {
      decisions.push({ hit, status: "rejected", reason: "invalid-url" });
      continue;
    }
    decisions.push({ hit, status: "accepted", canonicalUrl });
    const current = groups.get(canonicalUrl) ?? [];
    current.push(hit);
    groups.set(canonicalUrl, current);
  }

  return {
    stories: [...groups.entries()]
      .map(([canonicalUrl, matches]) => toStory(canonicalUrl, matches, window))
      .sort(
        (left, right) =>
          right.score - left.score || right.publishTime.localeCompare(left.publishTime),
      ),
    decisions,
  };
}

export function selectNewsStories(stories: NewsStory[], topics: NewsTopic[]): SelectedNewsStory[] {
  return selectNewsStoriesWithAudit(stories, topics).stories;
}

export function selectNewsStoriesWithAudit(
  stories: NewsStory[],
  topics: NewsTopic[],
): NewsStorySelectionResult {
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
  const enabledTopicIds = new Set(topics.filter(({ enabled }) => enabled).map(({ id }) => id));
  return {
    stories: selected,
    decisions: stories.map((story) => {
      if (selectedUrls.has(story.canonicalUrl)) return { story, status: "selected" };
      if (selected.some((candidate) => isSameTitleEvent(candidate, story))) {
        return { story, status: "filtered", reason: "duplicate-title" };
      }
      if (!story.topicIds.some((id) => enabledTopicIds.has(id))) {
        return { story, status: "filtered", reason: "no-enabled-topic" };
      }
      return {
        story,
        status: "filtered",
        reason: selected.length >= maxNewsBriefItems ? "brief-cap" : "topic-quota",
      };
    }),
  };
}

function rejectionReasonForHit(
  hit: NewsSearchHit,
  window: NewsTimeWindow,
): NewsHitRejectionReason | undefined {
  if (!hit.title.trim() || !hit.url.trim()) return "missing-fields";
  const publishedAt = hit.publishTime
    ? parsePublishTime(hit.publishTime, window.timezoneOffset)
    : Number.NaN;
  if (!Number.isFinite(publishedAt)) return "invalid-publish-time";
  if (publishedAt < window.since || publishedAt >= window.until) return "outside-window";
  const authLevel = hit.authInfoLevel ?? 4;
  if (hit.sourcePolicy === "official" ? authLevel !== 1 : authLevel > 2) {
    return "insufficient-authority";
  }
  const content = normalizeSearchText(
    [hit.title, hit.summary, hit.snippet].filter(Boolean).join(" "),
  );
  const subjectContent = normalizeSearchText(`${content} ${hit.siteName ?? ""}`);
  if (hit.excludedAny.some((term) => containsSearchTerm(content, term))) {
    return "excluded-content";
  }
  if (!hit.subjectAny.some((term) => containsSearchTerm(subjectContent, term))) {
    return "subject-mismatch";
  }
  if (!hit.eventAny.some((term) => containsSearchTerm(content, term))) {
    return "intent-mismatch";
  }
  return undefined;
}

function toStory(
  canonicalUrl: string,
  matches: NewsSearchHit[],
  window: NewsTimeWindow,
): NewsStory {
  const representative = [...matches].sort(
    (left, right) =>
      left.rankPosition - right.rankPosition || (right.rankScore ?? 0) - (left.rankScore ?? 0),
  )[0]!;
  const queryIds = uniq(matches.map(({ queryId }) => queryId));
  const queries = uniq(matches.map(({ queryText }) => queryText));
  const topicIds = uniq(matches.map(({ topicId }) => topicId));
  const topicLabels = uniq(matches.map(({ topicLabel }) => topicLabel));
  const authInfoLevel = Math.min(...matches.map(({ authInfoLevel }) => authInfoLevel ?? 4));
  const rankScore = Math.max(...matches.map(({ rankScore }) => rankScore ?? 0));
  const queryHits = queryIds.length;
  const bestRankPosition = Math.min(...matches.map(({ rankPosition }) => rankPosition));
  const newestPublishTime = Math.max(
    ...matches.map(({ publishTime }) =>
      publishTime ? parsePublishTime(publishTime, window.timezoneOffset) : window.since,
    ),
  );
  const windowDuration = Math.max(1, window.until - window.since);
  const scoreBreakdown: NewsScoreBreakdown = {
    rank: Math.round(1_000 / (60 + bestRankPosition)),
    authority: authInfoLevel === 1 ? 12 : authInfoLevel === 2 ? 8 : 0,
    freshness: Math.round(
      Math.max(0, Math.min(1, (newestPublishTime - window.since) / windowDuration)) * 8,
    ),
    crossQuery: Math.min(4, Math.max(0, queryHits - 1) * 2),
  };
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
    queryIds,
    queries,
    queryHits,
    scoreBreakdown,
    score: Object.values(scoreBreakdown).reduce((total, value) => total + value, 0),
  };
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function containsSearchTerm(content: string, term: string): boolean {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return false;
  if (/\p{Script=Han}/u.test(normalizedTerm) || normalizedTerm.endsWith("-")) {
    return content.includes(normalizedTerm);
  }
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(content);
}
