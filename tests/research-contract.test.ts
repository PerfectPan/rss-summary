import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("research contract documentation", () => {
  it("requires starred repo research to inspect code architecture and quality", () => {
    const skill = readFileSync(new URL("../skills/feed-research-digest/SKILL.md", import.meta.url), "utf8");
    const researchDoc = readFileSync(new URL("../docs/digest-delivery-research.md", import.meta.url), "utf8");

    expect(skill).toContain("Code architecture and quality checks");
    expect(skill).toContain("top-level tree");
    expect(skill).toContain("entrypoints");
    expect(skill).toContain("dependency/runtime choices");
    expect(skill).toContain("tests/CI");
    expect(skill).toContain("recent commits, PRs, or releases");
    expect(skill).toContain("- 代码质量判断：");

    expect(researchDoc).toContain("lightweight code review");
    expect(researchDoc).toContain("Do not deep-research a starred repo again");
    expect(researchDoc).toContain("reuse the cached repo-level decision");
  });

  it("keeps the reusable model prompt separate from the Codex skill wrapper", () => {
    const promptUrl = new URL("../prompts/feed-research.md", import.meta.url);
    expect(existsSync(promptUrl)).toBe(true);

    const skill = readFileSync(new URL("../skills/feed-research-digest/SKILL.md", import.meta.url), "utf8");
    const prompt = readFileSync(promptUrl, "utf8");

    expect(skill).toContain("prompts/feed-research.md");
    expect(prompt).toContain("CANDIDATES_JSON");
    expect(prompt).toContain("state.researched");
    expect(prompt).toContain("代码质量判断");
    expect(prompt).toContain("top-level tree");
    expect(prompt).toContain("do not show `evidence` or `依据`");
  });
});
