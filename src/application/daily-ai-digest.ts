import { Cause, Effect, Exit } from "effect";

import { buildIndustryDocument, type IndustryBriefDocument } from "./industry-brief.js";
import { createDailyAiDeliveryReceipt, type DailyAiDeliveryReceipt } from "./daily-ai-receipt.js";
import {
  AllDoubaoQueriesFailedError,
  generateRivusNewsBrief,
  type RivusNewsBriefResult,
} from "./news-brief.js";
import type { NewsBriefAudit } from "./news-audit.js";
import {
  buildDailyAiDigest,
  type DailyAiDigest,
  type DailyAiEvidence,
} from "../domain/daily-ai.js";
import {
  calendarDayAtOffset,
  endOfCalendarDay,
  parseOffsetMilliseconds,
  shiftCalendarDay,
  startOfCalendarDay,
} from "../domain/time.js";
import { loadConfig } from "../infrastructure/config.js";

export type DailyAiDigestResult = DailyAiDigest & {
  day: string;
  windowLabel: string;
  generatedAt: string;
  warnings: string[];
  sourceAudit: {
    news: Array<{ day: string; edition: "noon" | "evening"; audit: NewsBriefAudit }>;
    industry?: NonNullable<IndustryBriefDocument["audit"]>;
  };
  deliveryReceipt: DailyAiDeliveryReceipt;
};

export type DailyAiWindow = { since: string; until: string };

type DailyAiDigestDependencies = {
  env?: NodeJS.ProcessEnv;
  industry?: (window: DailyAiWindow, env: NodeJS.ProcessEnv) => Promise<IndustryBriefDocument>;
  news?: (occurrence: string, edition: "noon" | "evening") => Promise<RivusNewsBriefResult>;
  now?: () => Date;
  draft?: unknown;
};

export async function generateDailyAiDigest(
  value: unknown,
  dependencies: DailyAiDigestDependencies = {},
): Promise<DailyAiDigestResult> {
  const input = parseInput(value);
  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  const until = Date.parse(input.occurrence);
  const since = until - 24 * 60 * 60 * 1000;
  const window = {
    since: new Date(since).toISOString(),
    until: new Date(until).toISOString(),
  };
  const day = calendarDayAtOffset(input.occurrence, timezoneOffset);
  const windowLabel = formatWindowLabel(since, until, timezoneOffset);
  const news =
    dependencies.news ?? ((occurrence, edition) => runNewsBrief({ occurrence, edition }, env));
  const industry = dependencies.industry ?? defaultIndustry;
  // Keep the shared Doubao search budget at two in-flight requests. Each news
  // edition owns a concurrency-two pool, so editions must not overlap.
  const newsCollections: Array<NewsEditionCollection & NewsSegment> = [];
  for (const segment of newsSegments(since, until, timezoneOffset)) {
    const collected = await collectNewsEdition(news, segment.occurrence, segment.edition);
    newsCollections.push({ ...segment, ...collected });
  }
  const official = await industry(window, env);
  const evidence = newsCollections
    .flatMap(({ result }) => newsEvidence(result))
    .concat(industryEvidence(official))
    .filter(({ publishedAt }) => isWithinWindow(publishedAt, since, until));
  const digest = buildDailyAiDigest(evidence, { draft: dependencies.draft });
  if (digest.evidence.length === 0) {
    throw new Error("Daily AI digest has no usable evidence from Doubao or official sources.");
  }
  return {
    ...digest,
    day,
    windowLabel,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    warnings: [
      ...newsCollections.flatMap(({ result, unavailable }) => (unavailable ? [] : result.warnings)),
      ...doubaoAvailabilityWarnings(newsCollections),
    ],
    sourceAudit: {
      news: newsCollections.map(({ day: segmentDay, edition, result }) => ({
        day: segmentDay,
        edition,
        audit: result.audit,
      })),
      ...(official.audit ? { industry: official.audit } : {}),
    },
    deliveryReceipt: createDailyAiDeliveryReceipt(
      input.occurrence,
      digest.items.flatMap(({ refs }) => refs),
    ),
  };
}

type NewsEditionCollection = { result: RivusNewsBriefResult; unavailable: boolean };
type NewsSegment = {
  day: string;
  edition: "noon" | "evening";
  occurrence: string;
};

async function collectNewsEdition(
  news: NonNullable<DailyAiDigestDependencies["news"]>,
  occurrence: string,
  edition: "noon" | "evening",
): Promise<NewsEditionCollection> {
  try {
    return { result: await news(occurrence, edition), unavailable: false };
  } catch (error) {
    if (!(error instanceof AllDoubaoQueriesFailedError)) throw error;
    return { result: error.result, unavailable: true };
  }
}

async function runNewsBrief(
  input: { occurrence: string; edition: "noon" | "evening" },
  env: NodeJS.ProcessEnv,
): Promise<RivusNewsBriefResult> {
  const exit = await Effect.runPromiseExit(generateRivusNewsBrief(input, { env }));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

function doubaoAvailabilityWarnings(
  collections: Array<NewsEditionCollection & NewsSegment>,
): string[] {
  const failed = collections.filter(({ unavailable }) => unavailable);
  if (failed.length === collections.length) {
    return ["Doubao 搜索暂不可用：所有查询均失败，本期仅使用官方来源"];
  }
  if (failed.length > 0) {
    const labels = failed.map(({ day, edition }) => `${day} ${edition}`).join("、");
    return [`Doubao 搜索部分不可用：${labels}，已继续使用其余新闻和官方来源`];
  }
  return [];
}

function newsSegments(since: number, until: number, timezoneOffset: string): NewsSegment[] {
  const firstDay = calendarDayAtOffset(new Date(since).toISOString(), timezoneOffset);
  const lastDay = calendarDayAtOffset(new Date(until).toISOString(), timezoneOffset);
  const segments: NewsSegment[] = [];
  for (let day = firstDay; ; day = shiftCalendarDay(day, 1)) {
    const dayStart = startOfCalendarDay(day, timezoneOffset);
    const dayEnd = endOfCalendarDay(day, timezoneOffset);
    const noon = dayStart + (12 * 60 + 30) * 60_000;
    appendNewsSegment(segments, { since, until }, day, "noon", dayStart, noon);
    appendNewsSegment(segments, { since, until }, day, "evening", noon, dayEnd);
    if (day === lastDay) break;
  }
  return segments;
}

function appendNewsSegment(
  segments: NewsSegment[],
  window: { since: number; until: number },
  day: string,
  edition: "noon" | "evening",
  segmentStart: number,
  segmentEnd: number,
): void {
  const overlapEnd = Math.min(window.until, segmentEnd);
  if (Math.max(window.since, segmentStart) >= overlapEnd) return;
  const occurrence =
    overlapEnd === segmentEnd && edition === "evening" ? overlapEnd - 1 : overlapEnd;
  segments.push({ day, edition, occurrence: new Date(occurrence).toISOString() });
}

function isWithinWindow(publishedAt: string, since: number, until: number): boolean {
  const instant = Date.parse(publishedAt);
  return Number.isFinite(instant) && instant >= since && instant < until;
}

function formatWindowLabel(since: number, until: number, timezoneOffset: string): string {
  return `${formatInstant(since, timezoneOffset)}–${formatInstant(until, timezoneOffset)} ${timezoneOffset}`;
}

function formatInstant(instant: number, timezoneOffset: string): string {
  return new Date(instant + parseOffsetMilliseconds(timezoneOffset))
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

function newsEvidence(result: RivusNewsBriefResult): DailyAiEvidence[] {
  return result.stories.map((story) => ({
    id: `news:${story.id}`,
    title: evidenceTitle(story.title),
    url: story.canonicalUrl,
    publishedAt: story.publishTime,
    excerpt: story.summary,
    tier: story.authInfoLevel === 1 ? "official" : "authoritative",
    sourceName: story.siteName,
    topicId: story.selectedTopicId,
  }));
}

function industryEvidence(document: IndustryBriefDocument): DailyAiEvidence[] {
  return document.candidates.flatMap((candidate) => {
    if (candidate.category === "paper") return [];
    const event = candidate.events[0];
    const title = candidate.label ?? event?.title;
    const url = candidate.url ?? event?.htmlUrl;
    if (!event || !title || !url) return [];
    const sourceName = event.sourceName ?? event.actor;
    return [
      {
        id: `official:${event.id}`,
        title: evidenceTitle(title),
        url,
        publishedAt: event.createdAt,
        excerpt: candidate.description ?? event.summary ?? title,
        tier: "official" as const,
        sourceName,
      },
    ];
  });
}

function evidenceTitle(title: string): string {
  return title
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。.!！]+$/u, "");
}

async function defaultIndustry(
  window: DailyAiWindow,
  env: NodeJS.ProcessEnv,
): Promise<IndustryBriefDocument> {
  const config = loadConfig(env, [
    "--dry-run",
    "--since",
    window.since,
    "--until",
    window.until,
    "--timezone-offset",
    env.FEED_TIMEZONE_OFFSET ?? "+08:00",
  ]);
  return Effect.runPromise(buildIndustryDocument(config));
}

function parseInput(value: unknown): { occurrence: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Daily AI input must be an object.");
  const occurrence = (value as Record<string, unknown>).occurrence;
  if (typeof occurrence !== "string" || !Number.isFinite(Date.parse(occurrence)))
    throw new Error("occurrence must be a valid date-time.");
  return { occurrence };
}
