import { Effect } from "effect";
import type { RivusToolDescriptor } from "@rivus/agent";

import { runPluginEffect } from "../../runtime.js";
import { loadEnvConfig, type AppConfig } from "../../config/env.js";
import { buildIndustryDocument, type IndustryBriefDocument } from "../shared/industry.js";
import { industryView } from "../../render/layouts/industry.js";
import { renderViewMarkdown } from "../../render/markdown.js";
import {
  assertCalendarDay,
  assertNotBothDayAndOccurrence,
  briefBaseInput,
  occurrenceDayOf,
  optionalToolInput,
  rivusToolResult,
  type RivusToolResult
} from "../shared/tool.js";

export const RSS_SUMMARY_INDUSTRY_TOOL_ID = "rss-summary/generate-industry-brief";

type RivusIndustryBriefInput = {
  day?: string;
  occurrence?: string;
  onlyNew?: boolean;
};

export type RivusIndustryBriefResult = RivusToolResult;

type RivusIndustryBriefDependencies = {
  buildIndustryDocument?: (config: AppConfig) => Effect.Effect<IndustryBriefDocument, Error>;
  env?: NodeJS.ProcessEnv;
};

function parseInput(value: unknown): RivusIndustryBriefInput {
  return briefBaseInput(optionalToolInput(value, "Rivus industry brief"));
}

/** Observe-only frontier Tool: first-party sources only, never writes state or sends webhooks. */
export async function generateRivusIndustryBrief(
  value: unknown,
  dependencies: RivusIndustryBriefDependencies = {}
): Promise<RivusIndustryBriefResult> {
  const input = parseInput(value);
  assertNotBothDayAndOccurrence(input);

  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  const day = input.day ?? occurrenceDayOf(input, timezoneOffset);
  assertCalendarDay(day);

  const base = await runPluginEffect(loadEnvConfig(env));
  // An explicit `onlyNew: false` falls back to the environment; anything else
  // keeps the Tool's read-only default.
  const onlyNew = input.onlyNew === false ? env.FEED_ONLY_NEW === "1" || env.FEED_ONLY_NEW === "true" : true;
  const config: AppConfig = {
    ...base,
    timezoneOffset,
    day: day ?? base.day,
    dryRun: true,
    webhookUrl: undefined,
    onlyNew
  };
  const document = await runPluginEffect((dependencies.buildIndustryDocument ?? buildIndustryDocument)(config));
  return rivusToolResult(
    document,
    renderViewMarkdown(industryView(day ? { ...document, displayDate: day } : document))
  );
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
        type: "string"
      },
      occurrence: {
        description: "Scheduled occurrence as an ISO date-time",
        format: "date-time",
        type: "string"
      },
      onlyNew: { default: true, type: "boolean" }
    },
    type: "object"
  },
  risk: "observe",
  version: "1.1.0"
};
