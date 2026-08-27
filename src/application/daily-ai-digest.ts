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
import { calendarDayAtOffset, shiftCalendarDay } from "../domain/time.js";
import { loadConfig } from "../infrastructure/config.js";

export type DailyAiDigestResult = DailyAiDigest & {
  day: string;
  generatedAt: string;
  warnings: string[];
  sourceAudit: {
    news: { noon: NewsBriefAudit; evening: NewsBriefAudit };
    industry?: NonNullable<IndustryBriefDocument["audit"]>;
  };
  deliveryReceipt: DailyAiDeliveryReceipt;
};

type DailyAiDigestDependencies = {
  env?: NodeJS.ProcessEnv;
  industry?: (day: string, env: NodeJS.ProcessEnv) => Promise<IndustryBriefDocument>;
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
  const day = shiftCalendarDay(calendarDayAtOffset(input.occurrence, timezoneOffset), -1);
  const news =
    dependencies.news ?? ((occurrence, edition) => runNewsBrief({ occurrence, edition }, env));
  const industry = dependencies.industry ?? defaultIndustry;
  // Keep the shared Doubao search budget at two in-flight requests. Each news
  // edition owns a concurrency-two pool, so editions must not overlap.
  const noon = await collectNewsEdition(news, `${day}T12:30:00${timezoneOffset}`, "noon");
  const evening = await collectNewsEdition(news, `${day}T23:59:59${timezoneOffset}`, "evening");
  const official = await industry(day, env);
  const evidence = [
    ...newsEvidence(noon.result),
    ...newsEvidence(evening.result),
    ...industryEvidence(official),
  ];
  const digest = buildDailyAiDigest(evidence, { draft: dependencies.draft });
  if (digest.evidence.length === 0) {
    throw new Error("Daily AI digest has no usable evidence from Doubao or official sources.");
  }
  return {
    ...digest,
    day,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    warnings: [
      ...(noon.unavailable ? [] : noon.result.warnings),
      ...(evening.unavailable ? [] : evening.result.warnings),
      ...doubaoAvailabilityWarnings(noon.unavailable, evening.unavailable),
    ],
    sourceAudit: {
      news: { noon: noon.result.audit, evening: evening.result.audit },
      ...(official.audit ? { industry: official.audit } : {}),
    },
    deliveryReceipt: createDailyAiDeliveryReceipt(
      input.occurrence,
      digest.items.flatMap(({ refs }) => refs),
    ),
  };
}

type NewsEditionCollection = { result: RivusNewsBriefResult; unavailable: boolean };

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

function doubaoAvailabilityWarnings(noonFailed: boolean, eveningFailed: boolean): string[] {
  if (noonFailed && eveningFailed) {
    return ["Doubao 搜索暂不可用：午间、晚间查询全部失败，本期仅使用官方来源"];
  }
  if (noonFailed) return ["午间 Doubao 搜索全部不可用，已继续使用晚间和官方来源"];
  if (eveningFailed) return ["晚间 Doubao 搜索全部不可用，已继续使用午间和官方来源"];
  return [];
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
        topicId: topicForIndustry(candidate.eventTypes, title),
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

function topicForIndustry(eventTypes: string[], title: string): string {
  if (eventTypes.includes("release") || /模型|model|weights/iu.test(title))
    return "ai-model-releases";
  if (/API|SDK|CLI|开发|GitHub|MCP/iu.test(title)) return "developer-tools";
  return "industry-official";
}

async function defaultIndustry(
  day: string,
  env: NodeJS.ProcessEnv,
): Promise<IndustryBriefDocument> {
  const config = loadConfig(env, [
    "--dry-run",
    "--day",
    day,
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
