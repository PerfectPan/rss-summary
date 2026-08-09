import { RIVUS_PLUGIN_API_VERSION, type RivusPlugin, type RivusPluginRegistry } from "@rivus/agent";
import { Effect } from "effect";

import {
  generateRivusNewsBrief,
  type RivusNewsBriefOutput,
  type RivusNewsBriefResult,
} from "../application/news-brief.js";
import { generateSignalBrief, type SignalBriefOutput } from "../application/signal-brief.js";
import { generateRivusIndustryBrief, type RivusIndustryBriefResult } from "./rivus-industry.js";
import { generateRivusDigest, type RivusDigestResult } from "./rivus-digest.js";
import { renderNewsBrief } from "./news-render.js";
import { withSignalMarkdown } from "./signal-render.js";

export const RSS_SUMMARY_TOOL_ID = "rss-summary/generate-digest";
export const RSS_SUMMARY_NEWS_TOOL_ID = "rss-summary/generate-news-brief";
export const RSS_SUMMARY_SIGNAL_TOOL_ID = "rss-summary/generate-signal-brief";
export const RSS_SUMMARY_INDUSTRY_TOOL_ID = "rss-summary/generate-industry-brief";
export const RSS_SUMMARY_PROFILE_ID = "rss-digest";
export const RSS_SUMMARY_AUTOMATION_ID = "rss-summary/daily-digest";
export const RSS_SUMMARY_MORNING_AUTOMATION_ID = "rss-summary/morning-feed-digest";
export const RSS_SUMMARY_NOON_AUTOMATION_ID = "rss-summary/noon-news-brief";
export const RSS_SUMMARY_EVENING_AUTOMATION_ID = "rss-summary/evening-news-brief";
export const RSS_SUMMARY_SIGNAL_AUTOMATION_ID = "rss-summary/daily-signal-brief";
export const RSS_SUMMARY_INDUSTRY_AUTOMATION_ID = "rss-summary/daily-industry-brief";

type RssSummaryPluginDependencies = {
  generateDigest?: (input: unknown) => Promise<RivusDigestResult>;
  generateNewsBrief?: (input: unknown) => Promise<RivusNewsBriefOutput>;
  generateSignalBrief?: (input: unknown) => Promise<SignalBriefOutput>;
  generateIndustryBrief?: (input: unknown) => Promise<RivusIndustryBriefResult>;
};

function withNewsMarkdown(result: RivusNewsBriefResult): RivusNewsBriefOutput {
  return {
    ...result,
    markdown: renderNewsBrief({
      day: result.day,
      edition: result.edition,
      generatedAt: result.generatedAt,
      stories: result.stories,
      topics: result.topics,
      warnings: result.warnings,
      windowLabel: result.windowLabel,
    }),
  };
}

export function createRssSummaryPlugin(
  dependencies: RssSummaryPluginDependencies = {},
): RivusPlugin {
  const executeDigest = dependencies.generateDigest ?? generateRivusDigest;
  const executeNewsBrief =
    dependencies.generateNewsBrief ??
    (async (input: unknown) =>
      withNewsMarkdown(await Effect.runPromise(generateRivusNewsBrief(input))));
  const executeSignalBrief =
    dependencies.generateSignalBrief ??
    (async (input: unknown) =>
      withSignalMarkdown(await Effect.runPromise(generateSignalBrief(input))));
  const executeIndustryBrief = dependencies.generateIndustryBrief ?? generateRivusIndustryBrief;

  return {
    manifest: {
      apiVersion: RIVUS_PLUGIN_API_VERSION,
      id: "rss-summary",
      version: "1.0.0",
    },
    register(registry: RivusPluginRegistry): void {
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeDigest(input) }),
        description:
          "Generate a read-only Markdown digest from the configured GitHub Home and RSS sources",
        digest: "sha256:rss-summary-generate-digest-v1",
        id: RSS_SUMMARY_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            day: {
              description: "Local calendar day in YYYY-MM-DD format",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              type: "string",
            },
            occurrence: {
              description: "Scheduled occurrence as an ISO date-time",
              format: "date-time",
              type: "string",
            },
            onlyNew: { default: true, type: "boolean" },
            rssOnly: { default: false, type: "boolean" },
            window: { enum: ["previous-calendar-day"], type: "string" },
          },
          type: "object",
        },
        risk: "observe",
        version: "1.0.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeNewsBrief(input) }),
        description:
          "Generate a read-only noon or evening Markdown news brief from bounded Doubao web searches",
        digest: "sha256:rss-summary-generate-news-brief-v1",
        id: RSS_SUMMARY_NEWS_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            edition: { enum: ["noon", "evening"], type: "string" },
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
        version: "1.0.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeSignalBrief(input) }),
        description:
          "Generate a read-only daily high-signal brief (updates + rising open source) from GitHub Search, Hacker News, and official-domain web search",
        digest: "sha256:rss-summary-generate-signal-brief-v1",
        id: RSS_SUMMARY_SIGNAL_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            day: {
              description:
                "Explicit local calendar day in YYYY-MM-DD format; defaults to the occurrence's day",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              type: "string",
            },
            occurrence: {
              description: "Scheduled occurrence as an ISO date-time",
              format: "date-time",
              type: "string",
            },
          },
          required: ["occurrence"],
          type: "object",
        },
        risk: "observe",
        version: "1.0.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeIndustryBrief(input) }),
        description:
          "Generate a read-only daily industry brief (releases, changelogs, research blogs) from the configured industry RSS sources",
        digest: "sha256:rss-summary-generate-industry-brief-v1",
        id: RSS_SUMMARY_INDUSTRY_TOOL_ID,
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
        version: "1.0.0",
      });
      registry.registerAgentProfile({
        displayName: "RSS & News Briefs",
        id: RSS_SUMMARY_PROFILE_ID,
        memory: { scopes: [] },
        model: {},
        skills: { allow: [] },
        systemPrompt:
          "Generate scheduled briefs only through the rss-summary Tool named in the task. Return its markdown field unchanged and do not add commentary.",
        tools: {
          allow: [
            RSS_SUMMARY_TOOL_ID,
            RSS_SUMMARY_NEWS_TOOL_ID,
            RSS_SUMMARY_SIGNAL_TOOL_ID,
            RSS_SUMMARY_INDUSTRY_TOOL_ID,
          ],
        },
      });
      registry.registerAutomation({
        createInput: ({ occurrence }) => ({
          text: `请只调用一次 ${RSS_SUMMARY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, onlyNew: true })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
        }),
        id: RSS_SUMMARY_AUTOMATION_ID,
        profileId: RSS_SUMMARY_PROFILE_ID,
        requestedSkillIds: [],
        requestedToolIds: [RSS_SUMMARY_TOOL_ID],
      });
      registry.registerAutomation({
        createInput: ({ occurrence }) => ({
          text: `请只调用一次 ${RSS_SUMMARY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, onlyNew: true, window: "previous-calendar-day" })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
        }),
        id: RSS_SUMMARY_MORNING_AUTOMATION_ID,
        profileId: RSS_SUMMARY_PROFILE_ID,
        requestedSkillIds: [],
        requestedToolIds: [RSS_SUMMARY_TOOL_ID],
      });
      registry.registerAutomation({
        createInput: ({ occurrence }) => ({
          text: `请只调用一次 ${RSS_SUMMARY_NEWS_TOOL_ID}，输入 ${JSON.stringify({ occurrence, edition: "noon" })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
        }),
        id: RSS_SUMMARY_NOON_AUTOMATION_ID,
        profileId: RSS_SUMMARY_PROFILE_ID,
        requestedSkillIds: [],
        requestedToolIds: [RSS_SUMMARY_NEWS_TOOL_ID],
      });
      registry.registerAutomation({
        createInput: ({ occurrence }) => ({
          text: `请只调用一次 ${RSS_SUMMARY_NEWS_TOOL_ID}，输入 ${JSON.stringify({ occurrence, edition: "evening" })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
        }),
        id: RSS_SUMMARY_EVENING_AUTOMATION_ID,
        profileId: RSS_SUMMARY_PROFILE_ID,
        requestedSkillIds: [],
        requestedToolIds: [RSS_SUMMARY_NEWS_TOOL_ID],
      });
      registry.registerAutomation({
        createInput: ({ occurrence }) => ({
          text: `请只调用一次 ${RSS_SUMMARY_SIGNAL_TOOL_ID}，输入 ${JSON.stringify({ occurrence })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
        }),
        id: RSS_SUMMARY_SIGNAL_AUTOMATION_ID,
        profileId: RSS_SUMMARY_PROFILE_ID,
        requestedSkillIds: [],
        requestedToolIds: [RSS_SUMMARY_SIGNAL_TOOL_ID],
      });
      registry.registerAutomation({
        createInput: ({ occurrence }) => ({
          text: `请只调用一次 ${RSS_SUMMARY_INDUSTRY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, onlyNew: true })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
        }),
        id: RSS_SUMMARY_INDUSTRY_AUTOMATION_ID,
        profileId: RSS_SUMMARY_PROFILE_ID,
        requestedSkillIds: [],
        requestedToolIds: [RSS_SUMMARY_INDUSTRY_TOOL_ID],
      });
    },
  };
}

export default createRssSummaryPlugin();
