import {
  RIVUS_PLUGIN_API_VERSION,
  type RivusPlugin,
  type RivusPluginRegistry,
} from "@rivus/agent";

import { generateRivusDigest, type RivusDigestResult } from "./rivus-digest.js";

export const RSS_SUMMARY_TOOL_ID = "rss-summary/generate-digest";
export const RSS_SUMMARY_PROFILE_ID = "rss-digest";
export const RSS_SUMMARY_AUTOMATION_ID = "rss-summary/daily-digest";

type RssSummaryPluginDependencies = {
  generateDigest?: (input: unknown) => Promise<RivusDigestResult>;
};

export function createRssSummaryPlugin(dependencies: RssSummaryPluginDependencies = {}): RivusPlugin {
  const execute = dependencies.generateDigest ?? generateRivusDigest;

  return {
    manifest: {
      apiVersion: RIVUS_PLUGIN_API_VERSION,
      id: "rss-summary",
      version: "1.0.0",
    },
    register(registry: RivusPluginRegistry): void {
      registry.registerTool({
        createExecutor: () => ({ execute: (input) => execute(input) }),
        description: "Generate a read-only Markdown digest from the configured GitHub Home and RSS sources",
        digest: "sha256:rss-summary-generate-digest-v1",
        id: RSS_SUMMARY_TOOL_ID,
        idempotency: "none",
        inputSchema: {
          additionalProperties: false,
          properties: {
            day: { description: "Local calendar day in YYYY-MM-DD format", pattern: "^\\d{4}-\\d{2}-\\d{2}$", type: "string" },
            occurrence: { description: "Scheduled occurrence as an ISO date-time", format: "date-time", type: "string" },
            onlyNew: { default: true, type: "boolean" },
            rssOnly: { default: false, type: "boolean" },
          },
          type: "object",
        },
        risk: "observe",
        version: "1.0.0",
      });
      registry.registerAgentProfile({
        displayName: "RSS Digest",
        id: RSS_SUMMARY_PROFILE_ID,
        memory: { scopes: [] },
        model: {},
        skills: { allow: [] },
        systemPrompt:
          "Generate feed digests only through rss-summary/generate-digest. Return its markdown field unchanged and do not add commentary.",
        tools: { allow: [RSS_SUMMARY_TOOL_ID] },
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
    },
  };
}

export default createRssSummaryPlugin();
