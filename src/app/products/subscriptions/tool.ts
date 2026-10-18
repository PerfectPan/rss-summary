import { Effect } from "effect";

import type { RunAudit } from "../../../delivery/index.js";
import type { DigestDocument } from "../../../editorial/index.js";
import { calendarDayAtOffset, shiftCalendarDay } from "../../../kernel/index.js";
import { runPluginEffect } from "../../runtime.js";
import { loadEnvConfig, type AppConfig } from "../../config/env.js";
import { buildDigestDocument } from "./flow.js";
import { renderMarkdownDigest } from "../../render/render.js";

export const RSS_SUMMARY_TOOL_ID = "rss-summary/generate-digest";

export type RivusDigestInput = {
  day?: string;
  occurrence?: string;
  onlyNew?: boolean;
  rssOnly?: boolean;
  window?: "previous-calendar-day";
};

export type RivusDigestResult = {
  candidateCount: number;
  generatedAt: string;
  markdown: string;
  paperCandidateCount: number;
  windowLabel?: string;
  audit?: RunAudit;
};

type RivusDigestDependencies = {
  buildDigestDocument?: (config: AppConfig) => Effect.Effect<DigestDocument, Error>;
  env?: NodeJS.ProcessEnv;
};

export type CollectedRivusDigest = {
  day?: string;
  document: DigestDocument;
};

export async function generateRivusDigest(
  value: unknown,
  dependencies: RivusDigestDependencies = {},
): Promise<RivusDigestResult> {
  const { day, document } = await collectRivusDigest(value, dependencies);
  const paperCandidateCount = document.candidates.filter(
    (candidate) => candidate.category === "paper",
  ).length;
  return {
    candidateCount: document.candidates.length - paperCandidateCount,
    generatedAt: document.generatedAt,
    markdown: renderMarkdownDigest(day ? { ...document, displayDate: day } : document),
    paperCandidateCount,
    ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
    ...(document.audit ? { audit: document.audit } : {}),
  };
}

/**
 * Decode the Tool input into the digest request: dry-run is forced, onlyNew
 * defaults to true, and `previous-calendar-day` resolves from the occurrence's
 * local calendar day. No argv round-trip and no environment mutation.
 */
export async function collectRivusDigest(
  value: unknown,
  dependencies: RivusDigestDependencies = {},
): Promise<CollectedRivusDigest> {
  const input = parseInput(value);
  if (input.day && input.occurrence) {
    throw new Error("day and occurrence cannot be used together.");
  }

  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  if (input.window && !input.occurrence) {
    throw new Error("window requires occurrence.");
  }
  const occurrenceDay = input.occurrence
    ? calendarDayAtOffset(input.occurrence, timezoneOffset)
    : undefined;
  const day =
    input.day ??
    (input.window === "previous-calendar-day" && occurrenceDay
      ? shiftCalendarDay(occurrenceDay, -1)
      : occurrenceDay);
  if (day && !/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    throw new Error("day must use YYYY-MM-DD format.");
  }

  const base = await runPluginEffect(loadEnvConfig(env));
  const onlyNew = input.onlyNew ?? true;
  const rssOnly = input.rssOnly ?? (env.FEED_RSS_ONLY === "1" || env.FEED_RSS_ONLY === "true");
  const config: AppConfig = {
    ...base,
    timezoneOffset,
    day: day ?? base.day,
    dryRun: true,
    webhookUrl: undefined,
    onlyNew,
    ...(input.rssOnly !== undefined || rssOnly ? { rssOnly } : { rssOnly: false }),
  };
  const document = await runPluginEffect(
    (dependencies.buildDigestDocument ?? buildDigestDocument)(config),
  );
  return {
    ...(day ? { day } : {}),
    document,
  };
}

function parseInput(value: unknown): RivusDigestInput {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rivus digest input must be an object.");
  }

  const input = value as Record<string, unknown>;
  return {
    day: optionalString(input.day, "day"),
    occurrence: optionalString(input.occurrence, "occurrence"),
    onlyNew: optionalBoolean(input.onlyNew, "onlyNew"),
    rssOnly: optionalBoolean(input.rssOnly, "rssOnly"),
    window: optionalWindow(input.window),
  };
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function optionalWindow(value: unknown): "previous-calendar-day" | undefined {
  if (value === undefined) return undefined;
  if (value !== "previous-calendar-day") throw new Error("window must be previous-calendar-day.");
  return value;
}
