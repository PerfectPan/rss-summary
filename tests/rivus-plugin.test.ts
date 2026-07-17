import { assertRivusPluginConforms } from "@rivus/agent/testing";
import type {
  RivusAgentProfile,
  RivusAutomationTemplate,
  RivusPluginRegistry,
  RivusToolDescriptor,
  RivusToolExecutionContext,
} from "@rivus/agent";
import { describe, expect, it, vi } from "vitest";

import rssSummaryPlugin, {
  createRssSummaryPlugin,
  RSS_SUMMARY_AUTOMATION_ID,
  RSS_SUMMARY_PROFILE_ID,
  RSS_SUMMARY_TOOL_ID,
} from "../src/rivus-plugin.js";

describe("rss-summary Rivus Plugin", () => {
  it("conforms as an external Plugin with one narrow read-only Tool", async () => {
    await expect(
      assertRivusPluginConforms({
        deployment: {
          agentId: "rss-digest",
          endpointIds: [],
          pluginId: "rss-summary",
          profileId: RSS_SUMMARY_PROFILE_ID,
          skills: { allow: [] },
          tools: { allow: [RSS_SUMMARY_TOOL_ID] },
        },
        plugin: rssSummaryPlugin,
      }),
    ).resolves.toMatchObject({
      pluginId: "rss-summary",
      profileId: RSS_SUMMARY_PROFILE_ID,
      toolIds: [RSS_SUMMARY_TOOL_ID],
    });
  });

  it("delegates Tool execution to the rss-summary application adapter", async () => {
    const generateDigest = vi.fn(async () => ({
      candidateCount: 1,
      generatedAt: "2026-07-17T02:00:00.000Z",
      markdown: "# Feed Digest\n",
      windowLabel: "2026-07-17 +08:00",
    }));
    const registrations = register(createRssSummaryPlugin({ generateDigest }));

    const result = await registrations.tool.createExecutor({
      toolId: RSS_SUMMARY_TOOL_ID,
      toolVersion: "1.0.0",
    }).execute(
      { day: "2026-07-17", onlyNew: true },
      executionContext(),
    );

    expect(generateDigest).toHaveBeenCalledWith({ day: "2026-07-17", onlyNew: true });
    expect(result).toMatchObject({ candidateCount: 1, markdown: "# Feed Digest\n" });
    expect(registrations.tool.risk).toBe("observe");
  });

  it("registers a daily Automation that passes its exact occurrence to the Tool", () => {
    const registrations = register(rssSummaryPlugin);
    const input = registrations.automation.createInput({ occurrence: "2026-07-17T02:00:00.000Z" });

    expect(registrations.profile.tools.allow).toEqual([RSS_SUMMARY_TOOL_ID]);
    expect(registrations.automation.id).toBe(RSS_SUMMARY_AUTOMATION_ID);
    expect(registrations.automation.requestedToolIds).toEqual([RSS_SUMMARY_TOOL_ID]);
    expect(input.text).toContain(RSS_SUMMARY_TOOL_ID);
    expect(input.text).toContain('"occurrence":"2026-07-17T02:00:00.000Z"');
    expect(input.text).toContain("原样返回");
  });
});

function register(plugin: { register(registry: RivusPluginRegistry): void }): {
  automation: RivusAutomationTemplate;
  profile: RivusAgentProfile;
  tool: RivusToolDescriptor;
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
  if (!profiles[0] || !tools[0] || !automations[0]) throw new Error("Plugin registration is incomplete");
  return { automation: automations[0], profile: profiles[0], tool: tools[0] };
}

function executionContext(): RivusToolExecutionContext {
  return {
    agentId: "rss-digest",
    callId: "call-1",
    instanceId: "rss-digest:cli",
    policyEpoch: 1,
    runId: "run-1",
    sessionKey: "local:rss-digest:test",
    toolId: RSS_SUMMARY_TOOL_ID,
    toolVersion: "1.0.0",
  };
}
