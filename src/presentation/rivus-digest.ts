import { Effect } from "effect";

import type { DigestDocument } from "../domain/digest.js";
import type { RunAudit } from "../domain/run-audit.js";
import type { AppConfig } from "../infrastructure/config.js";
import { loadConfig } from "../infrastructure/config.js";
import { buildDigestDocument } from "../application/digest.js";
import { renderMarkdownDigest } from "./render.js";
import { calendarDayAtOffset, shiftCalendarDay } from "../domain/time.js";

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

export async function generateRivusDigest(
  value: unknown,
  dependencies: RivusDigestDependencies = {},
): Promise<RivusDigestResult> {
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

  const argv = ["--dry-run", "--timezone-offset", timezoneOffset];
  if (day) argv.push("--day", day);
  if (input.onlyNew ?? true) argv.push("--only-new");
  if (input.rssOnly) argv.push("--rss-only");

  const configEnv = { ...env };
  if (input.onlyNew !== undefined) configEnv.FEED_ONLY_NEW = String(input.onlyNew);
  if (input.rssOnly !== undefined) configEnv.FEED_RSS_ONLY = String(input.rssOnly);
  const document = await Effect.runPromise(
    (dependencies.buildDigestDocument ?? buildDigestDocument)(loadConfig(configEnv, argv)),
  );
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
