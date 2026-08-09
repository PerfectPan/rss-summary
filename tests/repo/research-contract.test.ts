import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("research contract documentation", () => {
  it("requires starred repo research to inspect code architecture and quality", () => {
    const skill = readFileSync(
      new URL("../../skills/feed-research-digest/SKILL.md", import.meta.url),
      "utf8",
    );
    const researchDoc = readFileSync(
      new URL("../../docs/digest-delivery-research.md", import.meta.url),
      "utf8",
    );

    expect(skill).toContain("Code architecture and quality checks");
    expect(skill).toContain("top-level tree");
    expect(skill).toContain("entrypoints");
    expect(skill).toContain("dependency/runtime choices");
    expect(skill).toContain("tests/CI");
    expect(skill).toContain("recent commits, PRs, or releases");
    expect(skill).toContain("Do not overclaim beyond the inspected surface");
    expect(skill).toContain("rss-summary industry --json --only-new --dry-run");
    expect(skill).toContain("arxiv.org/abs/<id>");
    expect(skill).toContain(".state/industry-state.json");

    expect(researchDoc).toContain("lightweight code review");
    expect(researchDoc).toContain("Do not deep-research a starred repo again");
    expect(researchDoc).toContain("reuse the cached repo-level decision");
  });

  it("keeps the reusable model prompt separate from the Codex skill wrapper", () => {
    const promptUrl = new URL("../../prompts/feed-research.md", import.meta.url);
    expect(existsSync(promptUrl)).toBe(true);

    const skill = readFileSync(
      new URL("../../skills/feed-research-digest/SKILL.md", import.meta.url),
      "utf8",
    );
    const prompt = readFileSync(promptUrl, "utf8");

    expect(skill).toContain("prompts/feed-research.md");
    expect(prompt).toContain("CANDIDATES_JSON");
    expect(prompt).toContain("state.researched");
    expect(prompt).toContain("代码质量判断");
    expect(prompt).toContain("top-level tree");
    expect(prompt).toContain("`我的订阅`");
    expect(prompt).toContain("`行业前沿`");
    expect(prompt).toContain("## 输入");
    expect(prompt).toContain("## 分层消费");
    expect(prompt).toContain("audit.sources");
    expect(prompt).toContain("候选队列最多 8 篇");
    expect(prompt).toContain("最终 2–3 篇");
    expect(prompt).toContain("ar5iv.labs.arxiv.org/html/<id>");
  });
});
