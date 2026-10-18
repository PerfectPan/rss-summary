import { runPluginEffect } from "../app/runtime.js";
import {
  buildIndustryDocument,
  type IndustryBriefDocument,
} from "../app/products/frontier/flow.js";
import { createDailyAiDeliveryReceipt, type DailyAiDeliveryReceipt } from "../delivery/index.js";
import { collectXAccountPosts, type XAccountPosts } from "../acquisition/index.js";
import {
  buildDailyAiDigest,
  cleanDailyAiTitle,
  industryEvidence,
  type DailyAiDigest,
  type DailyAiEvidence,
} from "../editorial/index.js";
import { calendarDayAtOffset, parseOffsetMilliseconds } from "../domain/time.js";
import { loadEnvConfig } from "../app/config/env.js";
import { isDailyAiPaperSource } from "../acquisition/index.js";

export type DailyAiDigestResult = DailyAiDigest & {
  day: string;
  windowLabel: string;
  generatedAt: string;
  warnings: string[];
  sourceAudit: {
    xAccounts: XAccountPosts["audit"];
    industry?: NonNullable<IndustryBriefDocument["audit"]>;
  };
  deliveryReceipt: DailyAiDeliveryReceipt;
};

export type DailyAiWindow = { since: string; until: string };

type DailyAiDigestDependencies = {
  env?: NodeJS.ProcessEnv;
  industry?: (window: DailyAiWindow, env: NodeJS.ProcessEnv) => Promise<IndustryBriefDocument>;
  xAccounts?: (
    value: { since: string; until: string; handles: string[] },
    options: { env: NodeJS.ProcessEnv; now?: () => Date },
  ) => Promise<XAccountPosts>;
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
  const handles = (env.DAILY_AI_X_HANDLES ?? "ClaudeDevs")
    .split(",")
    .map((handle) => handle.trim())
    .filter(Boolean);
  const xAccounts = await (
    dependencies.xAccounts ??
    ((
      value: Parameters<typeof collectXAccountPosts>[0],
      options: Parameters<typeof collectXAccountPosts>[1],
    ) => runPluginEffect(collectXAccountPosts(value, options)))
  )({ ...window, handles }, { env, now: dependencies.now });
  const official = await (dependencies.industry ?? defaultIndustry)(window, env);
  const evidence = xEvidence(xAccounts)
    .concat(industryEvidence(official.candidates))
    .filter(({ publishedAt }) => isWithinWindow(publishedAt, since, until));
  const digest = buildDailyAiDigest(evidence, { draft: dependencies.draft });
  if (digest.evidence.length === 0) {
    throw new Error(
      "Daily AI digest has no usable evidence from subscribed X accounts or official sources.",
    );
  }
  return {
    ...digest,
    day,
    windowLabel,
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    warnings: [
      ...(official.audit?.sources
        .filter(({ status }) => status !== "ok")
        .map(({ name, error }) => `官方来源采集不完整：${name}${error ? `（${error}）` : ""}`) ??
        []),
    ],
    sourceAudit: {
      xAccounts: xAccounts.audit,
      ...(official.audit ? { industry: official.audit } : {}),
    },
    deliveryReceipt: createDailyAiDeliveryReceipt(
      input.occurrence,
      digest.items.flatMap(({ refs }) => refs),
    ),
  };
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

function xEvidence(result: XAccountPosts): DailyAiEvidence[] {
  return result.posts.map((post) => ({
    id: `x:${post.id}`,
    title: cleanDailyAiTitle(post.title),
    url: post.url,
    publishedAt: post.publishedAt,
    excerpt: post.summary,
    tier: "unverified",
    sourceName: `@${post.author} · X（Grok 整理）`,
  }));
}

async function defaultIndustry(
  window: DailyAiWindow,
  env: NodeJS.ProcessEnv,
): Promise<IndustryBriefDocument> {
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  const base = await runPluginEffect(loadEnvConfig(env));
  const config = {
    ...base,
    since: window.since,
    until: window.until,
    timezoneOffset,
    dryRun: true,
  };
  return runPluginEffect(
    buildIndustryDocument({
      ...config,
      // Daily AI cannot publish paper candidates, so exclude their sources before fetching.
      industrySources: config.industrySources.filter((source) => !isDailyAiPaperSource(source)),
    }),
  );
}

function parseInput(value: unknown): { occurrence: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Daily AI input must be an object.");
  const occurrence = (value as Record<string, unknown>).occurrence;
  if (typeof occurrence !== "string" || !Number.isFinite(Date.parse(occurrence)))
    throw new Error("occurrence must be a valid date-time.");
  return { occurrence };
}
