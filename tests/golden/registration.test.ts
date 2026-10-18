import type { RivusAutomationTemplate } from "@rivus/agent";
import { describe, expect, it } from "vite-plus/test";

import type { RssAutomationPresentation } from "../../src/app/render/automation.js";
import { matchSnapshot, registerPlugin } from "./harness.js";

const occurrence = "2026-08-16T04:00:00.000Z";
const markdown = `# 固定标题

一条固定说明

## 模型发布

1. 新模型上线 [↗ #1](https://example.com/item)
`;

describe("golden Rivus registration", () => {
  it("snapshots tools, the profile, and automation input plus presentation", async () => {
    const registered = registerPlugin();
    expect(registered.tools.size).toBe(5);
    expect(registered.automations).toHaveLength(5);

    const tools = [...registered.tools.values()].map((tool) => ({
      description: tool.description,
      digest: tool.digest,
      id: tool.id,
      idempotency: tool.idempotency,
      inputSchema: tool.inputSchema,
      risk: tool.risk,
      version: tool.version,
    }));
    const automations = registered.automations.map((automation) => {
      const presentation = presentationOf(automation);
      return {
        createInput: automation.createInput({ occurrence }),
        createPresentation: presentation.createPresentation({ occurrence, text: markdown }),
        id: automation.id,
        profileId: automation.profileId,
        requestedSkillIds: automation.requestedSkillIds,
        requestedToolIds: automation.requestedToolIds,
      };
    });
    await matchSnapshot("registration.txt", {
      automations,
      profile: registered.profile,
      tools,
    });
  });
});

function presentationOf(template: RivusAutomationTemplate): RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
} {
  if (!("createPresentation" in template))
    throw new Error("Automation presentation adapter is missing");
  return template as RivusAutomationTemplate & {
    createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
  };
}
