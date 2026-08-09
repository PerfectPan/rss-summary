import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { IndustryBriefDocument } from "../../src/application/industry-brief.js";
import { generateRivusIndustryBrief } from "../../src/presentation/rivus-industry.js";

describe("Rivus industry brief adapter", () => {
  it("renders markdown from the industry document and reports candidate count", async () => {
    const document: IndustryBriefDocument = {
      generatedAt: "2026-08-09T01:00:00.000Z",
      windowLabel: "2026-08-09 +08:00",
      candidates: [
        {
          repo: "rss:https://example.com/a",
          source: "rss",
          category: "article",
          score: 40,
          actors: ["OpenAI"],
          eventTypes: ["article"],
          reasons: ["matches interest: agent"],
          events: [],
          label: "Agent release",
          url: "https://example.com/a",
        },
      ],
    };

    const result = await generateRivusIndustryBrief(
      { occurrence: "2026-08-09T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        buildIndustryDocument: () => Effect.succeed(document),
      },
    );

    expect(result.candidateCount).toBe(1);
    expect(result.paperCandidateCount).toBe(0);
    expect(result.markdown).toContain("# 行业前沿 · 2026-08-09");
    expect(result.markdown).toContain("**[Agent release](https://example.com/a)**");
  });

  it("reports papers as pending instead of publishing their titles", async () => {
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

    const result = await generateRivusIndustryBrief(undefined, {
      env: {},
      buildIndustryDocument: () => Effect.succeed(document),
    });

    expect(result).toMatchObject({ candidateCount: 0, paperCandidateCount: 1 });
    expect(result.markdown).not.toContain("Unverified agent claim");
  });

  it("rejects day and occurrence used together", async () => {
    await expect(
      generateRivusIndustryBrief(
        { day: "2026-08-09", occurrence: "2026-08-09T01:00:00.000Z" },
        { env: {} },
      ),
    ).rejects.toThrow(/cannot be used together/);
  });
});
