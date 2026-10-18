import { Effect } from "effect";
import type { RivusToolDescriptor } from "@rivus/agent";

import type { RunAudit } from "../../../delivery/index.js";
import { calendarDayAtOffset } from "../../../kernel/index.js";
import { runPluginEffect } from "../../runtime.js";
import { loadEnvConfig, type AppConfig } from "../../config/env.js";
import { buildIndustryDocument, type IndustryBriefDocument } from "../shared/industry.js";
import { industryView } from "../../render/layouts/industry.js";
import { renderViewMarkdown } from "../../render/markdown.js";

export const RSS_SUMMARY_INDUSTRY_TOOL_ID = "rss-summary/generate-industry-brief";

export type RivusIndustryBriefInput = {
  day?: string;
  occurrence?: string;
  onlyNew?: boolean;
};

export type RivusIndustryBriefResult = {
  candidateCount: number;
  generatedAt: string;
  markdown: string;
  paperCandidateCount: number;
  windowLabel?: string;
  audit?: RunAudit;
};

type RivusIndustryBriefDependencies = {
  buildIndustryDocument?: (config: AppConfig) => Effect.Effect<IndustryBriefDocument, Error>;
  env?: NodeJS.ProcessEnv;
};

/** Observe-only frontier Tool: first-party sources only, never writes state or sends webhooks. */
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

  const base = await runPluginEffect(loadEnvConfig(env));
  // An explicit `onlyNew: false` falls back to the environment; anything else
  // keeps the Tool's read-only default.
  const onlyNew =
    input.onlyNew === false ? env.FEED_ONLY_NEW === "1" || env.FEED_ONLY_NEW === "true" : true;
  const config: AppConfig = {
    ...base,
    timezoneOffset,
    day: day ?? base.day,
    dryRun: true,
    webhookUrl: undefined,
    onlyNew,
  };
  const document = await runPluginEffect(
    (dependencies.buildIndustryDocument ?? buildIndustryDocument)(config),
  );
  const paperCandidateCount = document.candidates.filter(
    (candidate) => candidate.category === "paper",
  ).length;
  return {
    candidateCount: document.candidates.length - paperCandidateCount,
    generatedAt: document.generatedAt,
    markdown: renderViewMarkdown(industryView(day ? { ...document, displayDate: day } : document)),
    paperCandidateCount,
    ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
    ...(document.audit ? { audit: document.audit } : {}),
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

export const frontierToolDescriptor: Pick<
  RivusToolDescriptor,
  "description" | "digest" | "idempotency" | "inputSchema" | "risk" | "version"
> = {
  description:
    "Generate a read-only frontier brief from curated official feeds, listing pages, releases, and research sources",
  digest: "sha256:rss-summary-generate-industry-brief-v2",

  idempotency: "none",
  inputSchema: {
    additionalProperties: false,
    properties: {
      day: {
        description: "Explicit local calendar day in YYYY-MM-DD format",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        type: "string",
      },
      occurrence: {
        description: "Scheduled occurrence as an ISO date-time",
        format: "date-time",
        type: "string",
      },
      onlyNew: { default: true, type: "boolean" },
    },
    type: "object",
  },
  risk: "observe",
  version: "1.1.0",
};
