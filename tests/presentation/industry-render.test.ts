import { describe, expect, it } from "vite-plus/test";

import type { IndustryBriefDocument } from "../../src/application/industry-brief.js";
import { renderMarkdownIndustryBrief } from "../../src/presentation/industry-render.js";

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
});
