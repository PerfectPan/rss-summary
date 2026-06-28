import { readFileSync } from "node:fs";

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
});
