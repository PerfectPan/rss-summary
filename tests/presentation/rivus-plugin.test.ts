import { assertRivusPluginConforms } from "@rivus/agent/testing";
import type {
  RivusAgentProfile,
  RivusAutomationTemplate,
  RivusPluginRegistry,
  RivusToolDescriptor,
  RivusToolExecutionContext,
} from "@rivus/agent";
import { describe, expect, it, vi } from "vite-plus/test";

import rssSummaryPlugin, {
  createRssSummaryPlugin,
  RSS_SUMMARY_EVENING_AUTOMATION_ID,
  RSS_SUMMARY_INDUSTRY_AUTOMATION_ID,
  RSS_SUMMARY_INDUSTRY_TOOL_ID,
  RSS_SUMMARY_MORNING_AUTOMATION_ID,
  RSS_SUMMARY_NEWS_TOOL_ID,
  RSS_SUMMARY_NOON_AUTOMATION_ID,
  RSS_SUMMARY_PROFILE_ID,
  RSS_SUMMARY_TOOL_ID,
} from "../../src/presentation/rivus-plugin.js";

describe("rss-summary Rivus Plugin", () => {
  it("conforms as an external Plugin with three narrow read-only Tools", async () => {
    await expect(
      assertRivusPluginConforms({
        deployment: {
          agentId: "rss-digest",
          endpointIds: [],
          pluginId: "rss-summary",
          profileId: RSS_SUMMARY_PROFILE_ID,
          skills: { allow: [] },
          tools: {
            allow: [RSS_SUMMARY_TOOL_ID, RSS_SUMMARY_NEWS_TOOL_ID, RSS_SUMMARY_INDUSTRY_TOOL_ID],
          },
        },
        plugin: rssSummaryPlugin,
      }),
    ).resolves.toMatchObject({
      pluginId: "rss-summary",
      profileId: RSS_SUMMARY_PROFILE_ID,
      toolIds: [RSS_SUMMARY_INDUSTRY_TOOL_ID, RSS_SUMMARY_NEWS_TOOL_ID, RSS_SUMMARY_TOOL_ID].sort(),
    });
  });

  it("delegates Tool execution to the rss-summary application adapter", async () => {
    const generateDigest = vi.fn(async () => ({
      candidateCount: 1,
      generatedAt: "2026-07-17T02:00:00.000Z",
      markdown: "# Feed Digest\n",
      paperCandidateCount: 0,
      windowLabel: "2026-07-17 +08:00",
    }));
    const registrations = register(createRssSummaryPlugin({ generateDigest }));
    const tool = registrations.tools.get(RSS_SUMMARY_TOOL_ID)!;

    const result = await tool
      .createExecutor({
        toolId: RSS_SUMMARY_TOOL_ID,
        toolVersion: "1.0.0",
      })
      .execute({ day: "2026-07-17", onlyNew: true }, executionContext());

    expect(generateDigest).toHaveBeenCalledWith({ day: "2026-07-17", onlyNew: true });
    expect(result).toMatchObject({ candidateCount: 1, markdown: "# Feed Digest\n" });
    expect(tool.risk).toBe("observe");
  });

  it("delegates news Tool execution to the bounded Doubao search adapter", async () => {
    const generateNewsBrief = vi.fn(async () => ({
      day: "2026-07-29",
      edition: "noon" as const,
      generatedAt: "2026-07-29T04:30:00.000Z",
      itemCount: 2,
      markdown: "# 午间热点 · 2026-07-29\n",
      warnings: [],
      windowLabel: "00:00–12:30",
      stories: [],
      topics: [],
    }));
    const registrations = register(createRssSummaryPlugin({ generateNewsBrief }));
    const tool = registrations.tools.get(RSS_SUMMARY_NEWS_TOOL_ID)!;

    const result = await tool
      .createExecutor({
        toolId: RSS_SUMMARY_NEWS_TOOL_ID,
        toolVersion: "1.0.0",
      })
      .execute(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        executionContext(RSS_SUMMARY_NEWS_TOOL_ID),
      );

    expect(generateNewsBrief).toHaveBeenCalledWith({
      edition: "noon",
      occurrence: "2026-07-29T04:30:00.000Z",
    });
    expect(result).toMatchObject({ itemCount: 2, markdown: "# 午间热点 · 2026-07-29\n" });
    expect(tool.risk).toBe("observe");
  });

  it("uses the Node process environment when the Host invokes the packaged news Tool", async () => {
    vi.stubEnv("DOUBAO_SEARCH_API_KEY", "runtime-key");
    vi.stubEnv("FEED_TIMEZONE_OFFSET", "+08:00");
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ ResponseMetadata: {}, Result: { WebResults: [] } }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetch);

    try {
      const registrations = register(rssSummaryPlugin);
      const tool = registrations.tools.get(RSS_SUMMARY_NEWS_TOOL_ID)!;
      const result = await tool
        .createExecutor({
          toolId: RSS_SUMMARY_NEWS_TOOL_ID,
          toolVersion: "1.0.0",
        })
        .execute(
          { edition: "evening", occurrence: "2026-07-29T11:00:00.000Z" },
          executionContext(RSS_SUMMARY_NEWS_TOOL_ID),
        );

      expect(result).toMatchObject({ edition: "evening", itemCount: 0 });
      expect(fetch).toHaveBeenCalledTimes(7);
      expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
        Authorization: "Bearer runtime-key",
      });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("delegates industry Tool execution to the industry RSS adapter", async () => {
    const generateIndustryBrief = vi.fn(async () => ({
      candidateCount: 3,
      generatedAt: "2026-08-09T01:00:00.000Z",
      markdown: "# 行业简报 · 2026-08-09\n",
      paperCandidateCount: 1,
    }));
    const registrations = register(createRssSummaryPlugin({ generateIndustryBrief }));
    const tool = registrations.tools.get(RSS_SUMMARY_INDUSTRY_TOOL_ID)!;

    const result = await tool
      .createExecutor({
        toolId: RSS_SUMMARY_INDUSTRY_TOOL_ID,
        toolVersion: "1.0.0",
      })
      .execute(
        { occurrence: "2026-08-09T01:00:00.000Z" },
        executionContext(RSS_SUMMARY_INDUSTRY_TOOL_ID),
      );

    expect(generateIndustryBrief).toHaveBeenCalledWith({ occurrence: "2026-08-09T01:00:00.000Z" });
    expect(result).toMatchObject({
      candidateCount: 3,
      markdown: "# 行业简报 · 2026-08-09\n",
      paperCandidateCount: 1,
    });
    expect(tool.risk).toBe("observe");
  });

  it("registers morning, noon, evening, and industry Automations with exact Tool grants", () => {
    const registrations = register(rssSummaryPlugin);
    const occurrence = "2026-07-29T04:30:00.000Z";
    const morning = registrations.automations.get(RSS_SUMMARY_MORNING_AUTOMATION_ID)!;
    const noon = registrations.automations.get(RSS_SUMMARY_NOON_AUTOMATION_ID)!;
    const evening = registrations.automations.get(RSS_SUMMARY_EVENING_AUTOMATION_ID)!;
    const industry = registrations.automations.get(RSS_SUMMARY_INDUSTRY_AUTOMATION_ID)!;

    expect(registrations.profile.tools.allow).toEqual([
      RSS_SUMMARY_TOOL_ID,
      RSS_SUMMARY_NEWS_TOOL_ID,
      RSS_SUMMARY_INDUSTRY_TOOL_ID,
    ]);
    expect(morning.requestedToolIds).toEqual([RSS_SUMMARY_TOOL_ID]);
    expect(noon.requestedToolIds).toEqual([RSS_SUMMARY_NEWS_TOOL_ID]);
    expect(evening.requestedToolIds).toEqual([RSS_SUMMARY_NEWS_TOOL_ID]);
    expect(industry.requestedToolIds).toEqual([RSS_SUMMARY_INDUSTRY_TOOL_ID]);
    expect(morning.createInput({ occurrence }).text).toContain('"window":"previous-calendar-day"');
    expect(noon.createInput({ occurrence }).text).toContain('"edition":"noon"');
    expect(evening.createInput({ occurrence }).text).toContain('"edition":"evening"');
    expect(industry.createInput({ occurrence }).text).toContain('"onlyNew":true');
    expect(noon.createInput({ occurrence }).text).toContain("原样返回");
  });
});

function register(plugin: { register(registry: RivusPluginRegistry): void }): {
  automations: Map<string, RivusAutomationTemplate>;
  profile: RivusAgentProfile;
  tools: Map<string, RivusToolDescriptor>;
} {
  const profiles: RivusAgentProfile[] = [];
  const tools: RivusToolDescriptor[] = [];
  const automations: RivusAutomationTemplate[] = [];
  plugin.register({
    registerAgentProfile: (profile) => profiles.push(profile),
    registerAutomation: (automation) => automations.push(automation),
    registerSkill: () => undefined,
    registerTool: (tool) => tools.push(tool),
  });
  if (!profiles[0] || !tools[0] || !automations[0])
    throw new Error("Plugin registration is incomplete");
  return {
    automations: new Map(automations.map((automation) => [automation.id, automation])),
    profile: profiles[0],
    tools: new Map(tools.map((tool) => [tool.id, tool])),
  };
}

function executionContext(toolId = RSS_SUMMARY_TOOL_ID): RivusToolExecutionContext {
  return {
    agentId: "rss-digest",
    callId: "call-1",
    instanceId: "rss-digest:cli",
    policyEpoch: 1,
    runId: "run-1",
    sessionKey: "local:rss-digest:test",
    toolId,
    toolVersion: "1.0.0",
  };
}
