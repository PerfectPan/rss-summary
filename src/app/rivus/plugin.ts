import { RIVUS_PLUGIN_API_VERSION, type RivusPlugin, type RivusPluginRegistry } from "@rivus/agent";

import { products, type PresentationAutomation } from "../products/index.js";
import {
  generateRivusIndustryBrief,
  type RivusIndustryBriefResult,
} from "../products/frontier/tool.js";
import { executeNewsBrief, type RivusNewsBriefOutput } from "../products/news/tool.js";
import { RSS_SUMMARY_NEWS_TOOL_ID } from "../products/news/tool.js";
import {
  createSubscriptionsToolExecutor,
  RSS_SUMMARY_TOOL_ID,
  type RivusDigestResult,
} from "../products/subscriptions/tool.js";
import {
  createDailyAiToolExecutor,
  RSS_SUMMARY_DAILY_AI_TOOL_ID,
} from "../products/daily-ai/tool.js";
import {
  createArticleResearchExecutor,
  type RivusArticleResearchResult,
} from "../products/research/tool.js";
import { RSS_SUMMARY_RESEARCH_TOOL_ID } from "../products/shared/tool-ids.js";
import { RSS_SUMMARY_INDUSTRY_TOOL_ID } from "../products/frontier/tool.js";

export const RSS_SUMMARY_PROFILE_ID = "rss-digest";

type RssSummaryPluginDependencies = {
  generateDigest?: (input: unknown) => Promise<RivusDigestResult>;
  generateNewsBrief?: (input: unknown) => Promise<RivusNewsBriefOutput>;
  generateIndustryBrief?: (input: unknown) => Promise<RivusIndustryBriefResult>;
  generateDailyAiDigest?: (input: unknown) => Promise<RivusDailyAiToolResult>;
  researchArticle?: (input: unknown) => Promise<RivusArticleResearchResult>;
};

type RivusDailyAiToolResult = Awaited<ReturnType<ReturnType<typeof createDailyAiToolExecutor>>>;

export function createRssSummaryPlugin(
  dependencies: RssSummaryPluginDependencies = {},
): RivusPlugin {
  const executeDigest = createSubscriptionsToolExecutor({
    ...(dependencies.generateDigest ? { generateDigest: dependencies.generateDigest } : {}),
  });
  const executeNewsBriefWithDefaults = dependencies.generateNewsBrief ?? executeNewsBrief;
  const executeIndustryBrief = dependencies.generateIndustryBrief ?? generateRivusIndustryBrief;
  const executeDailyAiDigest = dependencies.generateDailyAiDigest ?? createDailyAiToolExecutor();
  const executeArticleResearch = dependencies.researchArticle ?? createArticleResearchExecutor();

  // Registration order is locked by tests/golden/registration.test.ts.
  const toolOrder = [
    { productId: "daily-ai", id: RSS_SUMMARY_DAILY_AI_TOOL_ID, execute: executeDailyAiDigest },
    { productId: "subscriptions", id: RSS_SUMMARY_TOOL_ID, execute: executeDigest },
    { productId: "research", id: RSS_SUMMARY_RESEARCH_TOOL_ID, execute: executeArticleResearch },
    {
      productId: "news",
      id: RSS_SUMMARY_NEWS_TOOL_ID,
      execute: executeNewsBriefWithDefaults,
    },
    {
      productId: "frontier",
      id: RSS_SUMMARY_INDUSTRY_TOOL_ID,
      execute: (input: unknown) => executeIndustryBrief(input),
    },
  ];
  const automationOrder = ["subscriptions", "daily-ai", "news", "frontier"] as const;

  return {
    manifest: {
      apiVersion: RIVUS_PLUGIN_API_VERSION,
      id: "rss-summary",
      version: "1.0.0",
    },
    register(registry: RivusPluginRegistry): void {
      for (const tool of toolOrder) {
        const product = products.find((product) => product.id === tool.productId);
        if (!product) throw new Error(`No product registered for tool ${tool.id}`);
        registry.registerTool({
          createExecutor: () => ({ execute: (input) => tool.execute(input) }),
          ...product.tool.descriptor,
          id: tool.id,
        });
      }
      registry.registerAgentProfile({
        displayName: "Subscriptions & Frontier Briefs",
        id: RSS_SUMMARY_PROFILE_ID,
        memory: { scopes: [] },
        model: {},
        skills: { allow: [] },
        systemPrompt:
          "严格遵循任务指定的 rss-summary Tool 协议。编辑阶段只能依据 Tool 返回的 evidence 生成结构化草稿，禁止补写事实；如果 render 返回 SUBSCRIPTION_SUMMARY_VALIDATION_FAILED 或 DAILY_AI_DRAFT_VALIDATION_FAILED，依据错误原因修正无效条目并重新调用 render，最多重试两次；禁止回退到来源标题；最终只原样返回 render 阶段的 markdown。",
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
      for (const id of automationOrder) {
        const product = products.find((product) => product.id === id);
        if (!product) throw new Error(`Unknown product: ${id}`);
        for (const automation of product.automations(RSS_SUMMARY_PROFILE_ID)) {
          registry.registerAutomation(presentationAutomation(automation));
        }
      }
    },
  };
}

function presentationAutomation(template: PresentationAutomation): PresentationAutomation {
  return template;
}

// The plugin module keeps the historical constant surface for hosts.
export { RSS_SUMMARY_TOOL_ID, type RivusDigestResult } from "../products/subscriptions/tool.js";
export { RSS_SUMMARY_INDUSTRY_TOOL_ID } from "../products/frontier/tool.js";
export { RSS_SUMMARY_NEWS_TOOL_ID } from "../products/news/tool.js";
export { RSS_SUMMARY_DAILY_AI_TOOL_ID } from "../products/daily-ai/tool.js";
export { RSS_SUMMARY_RESEARCH_TOOL_ID } from "../products/shared/tool-ids.js";
export {
  RSS_SUMMARY_MORNING_AUTOMATION_ID,
  RSS_SUMMARY_AUTOMATION_SUPPRESSED,
} from "../products/subscriptions/automation.js";
export { RSS_SUMMARY_DAILY_AI_AUTOMATION_ID } from "../products/daily-ai/automation.js";
export {
  RSS_SUMMARY_NOON_AUTOMATION_ID,
  RSS_SUMMARY_EVENING_AUTOMATION_ID,
} from "../products/news/automation.js";
export { RSS_SUMMARY_INDUSTRY_AUTOMATION_ID } from "../products/frontier/automation.js";

export default createRssSummaryPlugin();
