import type { RivusToolDescriptor } from "@rivus/agent";

import {
  generateRivusNewsBrief,
  type RivusNewsBriefInput,
  type RivusNewsBriefOutput,
  type RivusNewsBriefResult,
} from "./flow.js";
import { newsView } from "../../render/layouts/news.js";
import { renderDeliveredMarkdown } from "../../render/view-store.js";
import { runPluginEffect } from "../../runtime.js";

export const RSS_SUMMARY_NEWS_TOOL_ID = "rss-summary/generate-news-brief";

export { generateRivusNewsBrief };
export type { RivusNewsBriefInput, RivusNewsBriefOutput, RivusNewsBriefResult };

function withNewsMarkdown(result: RivusNewsBriefResult): RivusNewsBriefOutput {
  return {
    ...result,
    markdown: renderDeliveredMarkdown(
      newsView({
        day: result.day,
        edition: result.edition,
        generatedAt: result.generatedAt,
        stories: result.stories,
        topics: result.topics,
        warnings: result.warnings,
        sourceStatus: result.sourceStatus,
        windowLabel: result.windowLabel,
      }),
    ),
  };
}

/** Default news Tool executor: run the brief flow and attach rendered Markdown. */
export async function executeNewsBrief(input: unknown): Promise<RivusNewsBriefOutput> {
  return withNewsMarkdown(await runPluginEffect(generateRivusNewsBrief(input)));
}

export const newsToolDescriptor: Pick<
  RivusToolDescriptor,
  "description" | "digest" | "idempotency" | "inputSchema" | "risk" | "version"
> = {
  description:
    "Generate a read-only noon or evening Markdown news brief from bounded, configured news searches",
  digest: "sha256:rss-summary-generate-news-brief-v3",

  idempotency: "none",
  inputSchema: {
    additionalProperties: false,
    properties: {
      edition: { enum: ["noon", "evening"], type: "string" },
      since: {
        type: "string",
        format: "date-time",
        description: "Optional catch-up start, at most 72 hours before occurrence",
      },
      reportedUrls: {
        type: "array",
        maxItems: 1000,
        items: { type: "string" },
        description: "URLs confirmed delivered; suppress duplicates during catch-up",
      },
      occurrence: {
        description: "Scheduled occurrence as an ISO date-time",
        format: "date-time",
        type: "string",
      },
    },
    required: ["edition", "occurrence"],
    type: "object",
  },
  risk: "observe",
  version: "1.1.0",
};
