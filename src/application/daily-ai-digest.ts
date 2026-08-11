import { Effect } from "effect";

import { buildIndustryDocument, type IndustryBriefDocument } from "./industry-brief.js";
import { createDailyAiDeliveryReceipt, type DailyAiDeliveryReceipt } from "./daily-ai-receipt.js";
import { generateRivusNewsBrief, type RivusNewsBriefResult } from "./news-brief.js";
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
    dependencies.news ??
    ((occurrence, edition) =>
      Effect.runPromise(generateRivusNewsBrief({ occurrence, edition }, { env })));
  const industry = dependencies.industry ?? defaultIndustry;
  // Keep the shared Doubao search budget at two in-flight requests. Each news
  // edition owns a concurrency-two pool, so editions must not overlap.
  const noon = await news(`${day}T12:30:00${timezoneOffset}`, "noon");
  const evening = await news(`${day}T23:59:59${timezoneOffset}`, "evening");
  const official = await industry(day, env);
  const evidence = [...newsEvidence(noon), ...newsEvidence(evening), ...industryEvidence(official)];
  const digest = buildDailyAiDigest(evidence, { draft: dependencies.draft });
  return {
    ...digest,
    day,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    warnings: [...noon.warnings, ...evening.warnings],
    deliveryReceipt: createDailyAiDeliveryReceipt(
      input.occurrence,
      digest.items.flatMap(({ refs }) => refs),
    ),
  };
}

function newsEvidence(result: RivusNewsBriefResult): DailyAiEvidence[] {
  return result.stories.map((story) => ({
    id: `news:${story.id}`,
    title: eventHeadline(story.title, story.siteName),
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
        title: eventHeadline(title, sourceName),
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

function eventHeadline(title: string, sourceName: string): string {
  const clean = title
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。.!！]+$/u, "");
  if (
    /发布|推出|上线|开放|开源|宣布|完成|收购|融资|更新|新增|支持|降低|提升|修复|披露|生效|预告|提供/u.test(
      clean,
    )
  )
    return clean;
  return `${sourceName} 发布「${clean}」`;
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
