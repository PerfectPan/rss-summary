import { describe, expect, it } from "vite-plus/test";

import type { IndustryBriefDocument } from "../../src/application/industry-brief.js";
import {
  renderJsonIndustryBrief,
  renderMarkdownIndustryBrief,
} from "../../src/presentation/industry-render.js";

describe("industry brief render", () => {
  it("renders the card header and ranked candidates", () => {
    const document: IndustryBriefDocument = {
      generatedAt: "2026-08-09T01:00:00.000Z",
      windowLabel: "2026-08-09 +08:00",
      candidates: [
        {
          repo: "rss:https://example.com/a",
          source: "rss",
          category: "article",
          score: 50,
          actors: ["OpenAI"],
          eventTypes: ["article"],
          reasons: ["matches interest: agent"],
          events: [],
          label: "New agent release",
          url: "https://example.com/a",
          description: "An agent framework release.",
        },
      ],
    };

    const markdown = renderMarkdownIndustryBrief(document);

    expect(markdown).toContain("# 行业简报 · 2026-08-09");
    expect(markdown).toContain("**1. [New agent release](https://example.com/a)**");
    expect(markdown).toContain("来源：OpenAI");
  });

  it("renders an empty note when there are no candidates", () => {
    const markdown = renderMarkdownIndustryBrief({
      generatedAt: "2026-08-09T01:00:00.000Z",
      candidates: [],
    });

    expect(markdown).toContain("没有筛出");
  });

  it("keeps unresearched papers out of Markdown while exposing them as JSON", () => {
    const document: IndustryBriefDocument = {
      generatedAt: "2026-08-09T01:00:00.000Z",
      candidates: [
        {
          repo: "rss:https://arxiv.org/abs/2608.01234",
          source: "rss",
          category: "paper",
          score: 55,
          actors: ["arXiv cs.AI"],
          eventTypes: ["paper"],
          reasons: ["matches paper abstract: agent"],
          events: [],
          label: "Unverified agent claim",
          url: "https://arxiv.org/abs/2608.01234",
        },
      ],
    };

    const markdown = renderMarkdownIndustryBrief(document);
    const json = JSON.parse(renderJsonIndustryBrief(document));

    expect(markdown).toContain("1 篇论文待深度调研");
    expect(markdown).not.toContain("Unverified agent claim");
    expect(json.candidates).toHaveLength(1);
    expect(json.candidates[0]).toMatchObject({ category: "paper" });
  });
});
