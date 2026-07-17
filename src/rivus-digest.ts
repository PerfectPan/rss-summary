import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { buildDigestDocument } from "./main.js";
import { renderMarkdownDigest, type DigestDocument } from "./render.js";

export type RivusDigestInput = {
  day?: string;
  occurrence?: string;
  onlyNew?: boolean;
  rssOnly?: boolean;
};

export type RivusDigestResult = {
  candidateCount: number;
  generatedAt: string;
  markdown: string;
  windowLabel?: string;
};

type RivusDigestDependencies = {
  buildDigestDocument?: (config: AppConfig) => Promise<DigestDocument>;
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
  const day = input.day ?? (input.occurrence ? dayAtOffset(input.occurrence, timezoneOffset) : undefined);
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
  const document = await (dependencies.buildDigestDocument ?? buildDigestDocument)(loadConfig(configEnv, argv));
  return {
    candidateCount: document.candidates.length,
    generatedAt: document.generatedAt,
    markdown: renderMarkdownDigest(document),
    ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
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
  };
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function dayAtOffset(occurrence: string, timezoneOffset: string): string {
  const instant = Date.parse(occurrence);
  if (!Number.isFinite(instant)) throw new Error("occurrence must be a valid date-time.");

  const match = /^([+-])(\d{2}):(\d{2})$/u.exec(timezoneOffset);
  if (!match) throw new Error("FEED_TIMEZONE_OFFSET must use +HH:MM or -HH:MM format.");
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) throw new Error("FEED_TIMEZONE_OFFSET is outside the valid range.");

  const direction = match[1] === "+" ? 1 : -1;
  return new Date(instant + direction * (hours * 60 + minutes) * 60_000).toISOString().slice(0, 10);
}
