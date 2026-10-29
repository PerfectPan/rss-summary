import {
  canonicalizeUrl,
  compactSummary,
  newsPublicationDayRange,
  newsPublicationRange,
  parsePublishTime,
  startOfCalendarDay,
} from "../../../../kernel/index.js";
import { isSameTitleEvent } from "../../identity/index.js";
import type {
  NewsHitDecision,
  NewsHitRejectionReason,
  NewsScoreBreakdown,
  NewsSearchHit,
  NewsStory,
  NewsStoryBuildResult,
  NewsStorySelectionResult,
  NewsTimeWindow,
  NewsTopic,
  SelectedNewsStory,
} from "../value-objects/news.js";

const maxNewsBriefItems = 8;

/** Whether a publisher timestamp falls inside the brief window, including date precision. */
export function publicationFitsWindow(
  publishedAt: string | undefined,
  window: NewsTimeWindow,
): boolean {
  const publication = newsPublicationRange(publishedAt, window.timezoneOffset);
  return (
    publication !== undefined &&
    publication.since >= window.since &&
    publication.until <= window.until
  );
}

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

export function selectNewsStories(
  stories: NewsStory[],
  topics: readonly NewsTopic[],
): SelectedNewsStory[] {
  return selectNewsStoriesWithAudit(stories, topics).stories;
}

export function selectNewsStoriesWithAudit(
  stories: NewsStory[],
  topics: readonly NewsTopic[],
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
  if (window.reportedUrls?.includes(canonicalizeUrl(hit.url) ?? "")) return "already-reported";
  const publication = hit.publishDay
    ? newsPublicationDayRange(hit.publishDay)
    : newsPublicationRange(hit.publishTime, window.timezoneOffset);
  if (!publication) return "invalid-publish-time";
  if (publication.precision === "day") {
    // Day granularity in a known timezone cannot be placed inside the day, so
    // any overlap with the window counts; instants and zoneless dates above
    // still have to fit completely.
    if (!(publication.since < window.until && publication.until > window.since))
      return "outside-window";
  } else if (publication.since < window.since || publication.until > window.until) {
    return "outside-window";
  }
  if (rejectsForAuthority(hit)) return "insufficient-authority";
  const content = normalizeSearchText(
    [hit.title, hit.summary, hit.snippet].filter(Boolean).join(" "),
  );
  const subjectContent = normalizeSearchText(`${content} ${hit.siteName ?? ""}`);
  if (hit.excludedAny.some((term) => containsSearchTerm(normalizeSearchText(hit.title), term))) {
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

function rejectsForAuthority(hit: NewsSearchHit): boolean {
  if (hit.sourcePolicy === "news") return false;
  const tier = hit.credibility.tier;
  if (hit.sourcePolicy === "official") return tier !== "official";
  return tier !== "official" && tier !== "authoritative";
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
  const queryIds = [...new Set(matches.map(({ queryId }) => queryId))];
  const queries = [...new Set(matches.map(({ queryText }) => queryText))];
  const topicIds = [...new Set(matches.map(({ topicId }) => topicId))];
  const topicLabels = [...new Set(matches.map(({ topicLabel }) => topicLabel))];
  const authInfoLevel = Math.min(...matches.map(({ authorityRank }) => authorityRank));
  const authorityTier = matches.find((hit) => hit.authorityRank === authInfoLevel)!.credibility
    .tier;
  const rankScore = Math.max(...matches.map(({ rankScore }) => rankScore ?? 0));
  const queryHits = queryIds.length;
  const bestRankPosition = Math.min(...matches.map(({ rankPosition }) => rankPosition));
  const newestPublishTime = Math.max(
    ...matches.map((hit) =>
      // A day-granular publication counts as its day's start, so its freshness
      // never exceeds an instant published anywhere inside that same day.
      hit.publishDay
        ? startOfCalendarDay(hit.publishDay.day, hit.publishDay.timezoneOffset)
        : hit.publishTime
          ? parsePublishTime(hit.publishTime, window.timezoneOffset)
          : window.since,
    ),
  );
  const windowDuration = Math.max(1, window.until - window.since);
  const scoreBreakdown: NewsScoreBreakdown = {
    rank: Math.round(1_000 / (60 + bestRankPosition)),
    authority: authorityTier === "official" ? 12 : authorityTier === "authoritative" ? 8 : 0,
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
  // Normalize only inflections of known event words, not product names or arbitrary suffixes.
  const eventForms: Record<string, string> = {
    releases: "release",
    released: "release",
    releasing: "release",
    changes: "change",
    announcements: "announcement",
    vulnerabilities: "vulnerability",
    updates: "update",
    launched: "launch",
    launches: "launch",
    outages: "outage",
    deprecations: "deprecation",
    deprecated: "deprecation",
  };
  const fold = (value: string) => value.replace(/\b[a-z]+\b/gu, (word) => eventForms[word] ?? word);
  content = fold(content);
  const escaped = fold(normalizedTerm).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(content);
}
