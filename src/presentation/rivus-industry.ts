import { Effect } from "effect";

import type { IndustryBriefDocument } from "../application/industry-brief.js";
import { buildIndustryDocument } from "../application/industry-brief.js";
import { calendarDayAtOffset } from "../domain/time.js";
import type { AppConfig } from "../infrastructure/config.js";
import { loadConfig } from "../infrastructure/config.js";
import { renderMarkdownIndustryBrief } from "./industry-render.js";

export type RivusIndustryBriefInput = {
  day?: string;
  occurrence?: string;
  onlyNew?: boolean;
};

export type RivusIndustryBriefResult = {
  candidateCount: number;
  generatedAt: string;
  markdown: string;
  windowLabel?: string;
};

type RivusIndustryBriefDependencies = {
  buildIndustryDocument?: (config: AppConfig) => Effect.Effect<IndustryBriefDocument, Error>;
  env?: NodeJS.ProcessEnv;
};

/** Observe-only industry brief Tool: RSS-only, never writes state or sends webhooks. */
export async function generateRivusIndustryBrief(
  value: unknown,
  dependencies: RivusIndustryBriefDependencies = {},
): Promise<RivusIndustryBriefResult> {
  const input = parseInput(value);
  if (input.day && input.occurrence) {
    throw new Error("day and occurrence cannot be used together.");
  }

  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  const occurrenceDay = input.occurrence
    ? calendarDayAtOffset(input.occurrence, timezoneOffset)
    : undefined;
  const day = input.day ?? occurrenceDay;
  if (day && !/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    throw new Error("day must use YYYY-MM-DD format.");
  }

  const argv = ["--dry-run", "--timezone-offset", timezoneOffset];
  if (day) argv.push("--day", day);
  if (input.onlyNew ?? true) argv.push("--only-new");

  const document = await Effect.runPromise(
    (dependencies.buildIndustryDocument ?? buildIndustryDocument)(loadConfig(env, argv)),
  );
  return {
    candidateCount: document.candidates.length,
    generatedAt: document.generatedAt,
    markdown: renderMarkdownIndustryBrief(day ? { ...document, displayDate: day } : document),
    ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
  };
}

function parseInput(value: unknown): RivusIndustryBriefInput {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rivus industry brief input must be an object.");
  }

  const input = value as Record<string, unknown>;
  return {
    day: optionalString(input.day, "day"),
    occurrence: optionalString(input.occurrence, "occurrence"),
    onlyNew: optionalBoolean(input.onlyNew, "onlyNew"),
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
