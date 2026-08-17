import {
  RIVUS_PLUGIN_API_VERSION,
  type RivusAutomationTemplate,
  type RivusPlugin,
  type RivusPluginRegistry,
} from "@rivus/agent";
import { Effect } from "effect";

import {
  generateRivusNewsBrief,
  type RivusNewsBriefOutput,
  type RivusNewsBriefResult,
} from "../application/news-brief.js";
import { dailyAiCategories } from "../domain/daily-ai.js";
import { generateRivusIndustryBrief, type RivusIndustryBriefResult } from "./rivus-industry.js";
import type { RivusDigestResult } from "./rivus-digest.js";
import { renderNewsBrief } from "./news-render.js";
import { createRivusSubscriptionExecutor } from "./subscription-tool.js";
import { createRivusDailyAiDigestExecutor, type RivusDailyAiToolResult } from "./daily-ai-tool.js";
import { createArticleResearchExecutor, type RivusArticleResearchResult } from "./research-tool.js";
import {
  createRssAutomationPresentation,
  type RssAutomationPresentation,
} from "./automation-presentation.js";

export const RSS_SUMMARY_TOOL_ID = "rss-summary/generate-digest";
export const RSS_SUMMARY_NEWS_TOOL_ID = "rss-summary/generate-news-brief";
export const RSS_SUMMARY_INDUSTRY_TOOL_ID = "rss-summary/generate-industry-brief";
export const RSS_SUMMARY_DAILY_AI_TOOL_ID = "rss-summary/generate-daily-ai-digest";
export const RSS_SUMMARY_RESEARCH_TOOL_ID = "rss-summary/research-article";
export const RSS_SUMMARY_PROFILE_ID = "rss-digest";
export const RSS_SUMMARY_AUTOMATION_SUPPRESSED =
  "RIVUS_AUTOMATION_SUPPRESSED: no high-value subscription updates";
export const RSS_SUMMARY_MORNING_AUTOMATION_ID = "rss-summary/morning-feed-digest";
export const RSS_SUMMARY_DAILY_AI_AUTOMATION_ID = "rss-summary/daily-ai-digest";
export const RSS_SUMMARY_NOON_AUTOMATION_ID = "rss-summary/noon-news-brief";
export const RSS_SUMMARY_EVENING_AUTOMATION_ID = "rss-summary/evening-news-brief";
export const RSS_SUMMARY_INDUSTRY_AUTOMATION_ID = "rss-summary/daily-industry-brief";

type RssSummaryPluginDependencies = {
  generateDigest?: (input: unknown) => Promise<RivusDigestResult>;
  generateNewsBrief?: (input: unknown) => Promise<RivusNewsBriefOutput>;
  generateIndustryBrief?: (input: unknown) => Promise<RivusIndustryBriefResult>;
  generateDailyAiDigest?: (input: unknown) => Promise<RivusDailyAiToolResult>;
  researchArticle?: (input: unknown) => Promise<RivusArticleResearchResult>;
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
  const executeDigest = createRivusSubscriptionExecutor({
    ...(dependencies.generateDigest ? { generate: dependencies.generateDigest } : {}),
  });
  const executeNewsBrief =
    dependencies.generateNewsBrief ??
    (async (input: unknown) =>
      withNewsMarkdown(await Effect.runPromise(generateRivusNewsBrief(input))));
  const executeIndustryBrief = dependencies.generateIndustryBrief ?? generateRivusIndustryBrief;
  const executeDailyAiDigest =
    dependencies.generateDailyAiDigest ?? createRivusDailyAiDigestExecutor();
  const executeArticleResearch = dependencies.researchArticle ?? createArticleResearchExecutor();

  return {
    manifest: {
      apiVersion: RIVUS_PLUGIN_API_VERSION,
      id: "rss-summary",
      version: "1.0.0",
    },
    register(registry: RivusPluginRegistry): void {
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeDailyAiDigest(input) }),
        description:
          "Generate a source-grounded Daily AI Digest for the previous Asia/Shanghai calendar day",
        digest: "sha256:rss-summary-generate-daily-ai-digest-v2",
        id: RSS_SUMMARY_DAILY_AI_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            draft: {
              description:
                "Editorial Array<{category, headline, refs}> produced only from collect evidence; required for render",
              items: {
                additionalProperties: false,
                properties: {
                  category: { enum: [...dailyAiCategories], type: "string" },
                  headline: { maxLength: 90, type: "string" },
                  refs: { items: { type: "string" }, minItems: 1, type: "array" },
                },
                required: ["category", "headline", "refs"],
                type: "object",
              },
              type: "array",
            },
            occurrence: { format: "date-time", type: "string" },
            phase: { enum: ["collect", "render"], type: "string" },
          },
          required: ["occurrence", "phase"],
          type: "object",
        },
        risk: "observe",
        version: "1.1.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeDigest(input) }),
        description:
          "Generate a read-only subscription brief from the user's GitHub Home and personal RSS sources",
        digest: "sha256:rss-summary-generate-digest-v2",
        id: RSS_SUMMARY_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            draft: {
              description:
                "Grounded Array<{ref, summary}> produced only from selected evidence; required for render",
              items: {
                additionalProperties: false,
                properties: {
                  ref: { minLength: 1, type: "string" },
                  summary: { maxLength: 180, minLength: 8, type: "string" },
                },
                required: ["ref", "summary"],
                type: "object",
              },
              type: "array",
            },
            research: {
              description: "Article research results returned by rss-summary/research-article",
              items: {
                additionalProperties: false,
                properties: {
                  content: { maxLength: 16_000, type: "string" },
                  error: { type: "string" },
                  fetchedUrl: { format: "uri", type: "string" },
                  ref: { minLength: 1, type: "string" },
                  status: { enum: ["failed", "ok"], type: "string" },
                  title: { type: "string" },
                  url: { format: "uri", type: "string" },
                },
                required: ["ref", "status", "url"],
                type: "object",
              },
              type: "array",
            },
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
            phase: { enum: ["collect", "select", "render"], type: "string" },
            rssOnly: { default: false, type: "boolean" },
            selection: {
              description:
                "AI second-pass Array<{ref, selected, reason}> produced only from collect evidence; required for render",
              items: {
                additionalProperties: false,
                properties: {
                  reason: { maxLength: 240, minLength: 4, type: "string" },
                  ref: { minLength: 1, type: "string" },
                  selected: { type: "boolean" },
                },
                required: ["ref", "selected", "reason"],
                type: "object",
              },
              type: "array",
            },
            window: { enum: ["previous-calendar-day"], type: "string" },
          },
          type: "object",
        },
        risk: "observe",
        version: "1.1.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeArticleResearch(input) }),
        description:
          "Fetch and extract the readable body of one Agent-selected public article URL for grounded summarization",
        digest: "sha256:rss-summary-research-article-v1",
        id: RSS_SUMMARY_RESEARCH_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            ref: { minLength: 1, type: "string" },
            url: { format: "uri", type: "string" },
          },
          required: ["ref", "url"],
          type: "object",
        },
        risk: "observe",
        version: "1.0.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeNewsBrief(input) }),
        description:
          "Generate a read-only noon or evening Markdown news brief from bounded Doubao web searches",
        digest: "sha256:rss-summary-generate-news-brief-v2",
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
        version: "1.1.0",
      });
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => executeIndustryBrief(input) }),
        description:
          "Generate a read-only frontier brief from curated official feeds, listing pages, releases, and research sources",
        digest: "sha256:rss-summary-generate-industry-brief-v2",
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
        version: "1.1.0",
      });
      registry.registerAgentProfile({
        displayName: "Subscriptions & Frontier Briefs",
        id: RSS_SUMMARY_PROFILE_ID,
        memory: { scopes: [] },
        model: {},
        skills: { allow: [] },
        systemPrompt:
          "严格遵循任务指定的 rss-summary Tool 协议。编辑阶段只能依据 Tool 返回的 evidence 生成结构化草稿，禁止补写事实；最终只原样返回 render 阶段的 markdown。",
        tools: {
          allow: [
            RSS_SUMMARY_TOOL_ID,
            RSS_SUMMARY_DAILY_AI_TOOL_ID,
            RSS_SUMMARY_RESEARCH_TOOL_ID,
            RSS_SUMMARY_NEWS_TOOL_ID,
            RSS_SUMMARY_INDUSTRY_TOOL_ID,
          ],
        },
      });
      registry.registerAutomation(
        presentationAutomation({
          createInput: ({ occurrence }) => ({
            text: `请严格按顺序完成“我的订阅”：\n1. 调用 ${RSS_SUMMARY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, window: "previous-calendar-day", onlyNew: true, rssOnly: false, phase: "collect" })}。\n2. 基于 collect 返回的全部 evidence 做第二轮 AI 精选：逐条判断是否值得推送给用户，重点考虑实际影响、与用户订阅兴趣的相关性、信息新颖性和证据充分性；普通 star/watch、重复公告、低信息量改动、仅标题变化和无法说明价值的条目应 selected=false。必须为每条 evidence 输出一项 Array<{ref, selected, reason}>，reason 用简短中文说明取舍，不得补写事实。若没有任何值得推送的条目，全部 selected=false。\n3. 再调用同一 Tool，输入 ${JSON.stringify({ occurrence, window: "previous-calendar-day", onlyNew: true, rssOnly: false, phase: "select" })} 并增加 selection 字段，值为上一步的完整精选结果。\n4. 对每个 selected=true 且有 URL 的 evidence 调用 ${RSS_SUMMARY_RESEARCH_TOOL_ID}，输入 {ref, url}，抓取对应网页正文；不要抓取未选中的条目。若研究失败，该条目改为 selected=false，不要用猜测补写。\n5. 只对研究成功的 selected=true evidence 生成摘要：摘要风格对齐 Daily AI Digest 的单条事件句，直接写主体、动作、具体变化或结果与影响；每条 1–2 句、180 字以内中文。必须优先依据研究 Tool 返回的正文，只能依据证据，不得补写来源中没有的数字或事实，也不要为 summaryPolicy=none 的条目生成摘要。若 URL 指向一篇日报，只概括其中高价值主题，不把整篇拆成多条，也不要写“来源名发布原始标题”或宣传语。\n6. 再调用同一 Tool，输入 ${JSON.stringify({ occurrence, window: "previous-calendar-day", onlyNew: true, rssOnly: false, phase: "render" })} 并增加 selection、research 与 draft 字段。若 selected=true 的条目为 0，render 仍返回空结果，最终只返回精确标记 \\"${RSS_SUMMARY_AUTOMATION_SUPPRESSED}\\"；否则仅将 render 返回的 markdown 字段原样返回，不得自行改写、添加或删除事实。`,
          }),
          createPresentation: ({ text }) => createRssAutomationPresentation(text, "subscriptions"),
          id: RSS_SUMMARY_MORNING_AUTOMATION_ID,
          profileId: RSS_SUMMARY_PROFILE_ID,
          requestedSkillIds: [],
          requestedToolIds: [RSS_SUMMARY_TOOL_ID, RSS_SUMMARY_RESEARCH_TOOL_ID],
        }),
      );
      registry.registerAutomation(
        presentationAutomation({
          createInput: ({ occurrence }) => ({
            text: `请严格按顺序完成 Daily AI Digest：\n1. 调用 ${RSS_SUMMARY_DAILY_AI_TOOL_ID}，输入 ${JSON.stringify({ occurrence, phase: "collect" })}。\n2. 只能引用 collect 返回的 evidence，编辑 12–24 条（质量不足不凑数）中文事件句；每条必须使用允许的 category、90 字以内 headline 和一个或多个真实 evidence id 作为 refs。单条写法直接交代主体、动作、具体变化或结果与影响；不得把 Blog/Changelog/Releases 等采集源名称作为主语，也不得套用“来源名 发布「原始标题」”模板。不得引入 evidence 中不存在的实体、数字、版本、日期或结论。\n3. 再调用同一 Tool，输入 ${JSON.stringify({ occurrence, phase: "render" })} 并增加 draft 字段，值为上一步编辑的 Array<{category, headline, refs}>。\n4. 仅将 render 返回的 markdown 字段原样返回，不得自行改写、添加或删除事实。`,
          }),
          createPresentation: ({ text }) => createRssAutomationPresentation(text, "daily-ai"),
          id: RSS_SUMMARY_DAILY_AI_AUTOMATION_ID,
          profileId: RSS_SUMMARY_PROFILE_ID,
          requestedSkillIds: [],
          requestedToolIds: [RSS_SUMMARY_DAILY_AI_TOOL_ID],
        }),
      );
      registry.registerAutomation(
        presentationAutomation({
          createInput: ({ occurrence }) => ({
            text: `请只调用一次 ${RSS_SUMMARY_NEWS_TOOL_ID}，输入 ${JSON.stringify({ occurrence, edition: "noon" })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
          }),
          createPresentation: ({ text }) => createRssAutomationPresentation(text, "news"),
          id: RSS_SUMMARY_NOON_AUTOMATION_ID,
          profileId: RSS_SUMMARY_PROFILE_ID,
          requestedSkillIds: [],
          requestedToolIds: [RSS_SUMMARY_NEWS_TOOL_ID],
        }),
      );
      registry.registerAutomation(
        presentationAutomation({
          createInput: ({ occurrence }) => ({
            text: `请只调用一次 ${RSS_SUMMARY_NEWS_TOOL_ID}，输入 ${JSON.stringify({ occurrence, edition: "evening" })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
          }),
          createPresentation: ({ text }) => createRssAutomationPresentation(text, "news"),
          id: RSS_SUMMARY_EVENING_AUTOMATION_ID,
          profileId: RSS_SUMMARY_PROFILE_ID,
          requestedSkillIds: [],
          requestedToolIds: [RSS_SUMMARY_NEWS_TOOL_ID],
        }),
      );
      registry.registerAutomation(
        presentationAutomation({
          createInput: ({ occurrence }) => ({
            text: `请只调用一次 ${RSS_SUMMARY_INDUSTRY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, onlyNew: true })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
          }),
          createPresentation: ({ text }) => createRssAutomationPresentation(text, "industry"),
          id: RSS_SUMMARY_INDUSTRY_AUTOMATION_ID,
          profileId: RSS_SUMMARY_PROFILE_ID,
          requestedSkillIds: [],
          requestedToolIds: [RSS_SUMMARY_INDUSTRY_TOOL_ID],
        }),
      );
    },
  };
}

type PresentationAutomationTemplate = RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
};

function presentationAutomation(
  template: PresentationAutomationTemplate,
): PresentationAutomationTemplate {
  return template;
}

export default createRssSummaryPlugin();
