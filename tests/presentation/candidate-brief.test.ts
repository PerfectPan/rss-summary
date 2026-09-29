import { describe, expect, it } from "vite-plus/test";

import { renderCandidateBrief } from "../../src/presentation/candidate-brief.js";

describe("candidate brief", () => {
  it("separates expanded and one-line candidates", () => {
    const markdown = renderCandidateBrief({
      header: "# Brief",
      metadata: "2 updates",
      candidates: [
        {
          repo: "strong",
          source: "rss",
          category: "release",
          score: 60,
          actors: ["Official"],
          eventTypes: ["release"],
          reasons: ["matches interest: agent"],
          matchedInterests: ["agent"],
          events: [],
          label: "Strong update",
          url: "https://example.com/strong",
          description: "What changed and why it matters.",
        },
        {
          repo: "routine",
          source: "rss",
          category: "release",
          score: 30,
          actors: ["Official"],
          eventTypes: ["release"],
          reasons: [],
          events: [],
          label: "Routine update",
          url: "https://example.com/routine",
        },
      ],
      featuredTitle: "Expanded",
      compactTitle: "Quick links",
      emptyMessage: "Empty",
      pendingMessage: (count) => `${count} pending`,
    });

    expect(markdown).toContain("**Expanded**");
    expect(markdown).toContain("What changed and why it matters.");
    expect(markdown).toContain("**Quick links**");
    expect(markdown).toContain("发布了「Routine update」。[Official ↗]");
  });

  it("does not expand an ordinary article unless the caller enables subscription summaries", () => {
    const article = {
      repo: "rss:https://example.com/article",
      source: "rss" as const,
      category: "article" as const,
      score: 30,
      actors: ["Example"],
      eventTypes: ["article" as const],
      reasons: [],
      events: [],
      label: "Ordinary article",
      url: "https://example.com/article",
      description: "A source excerpt.",
    };
    const common = {
      header: "# Brief",
      metadata: "1 update",
      candidates: [article],
      featuredTitle: "Expanded",
      compactTitle: "Quick links",
      emptyMessage: "Empty",
      pendingMessage: (count: number) => `${count} pending`,
    };

    expect(renderCandidateBrief(common)).toContain("**Quick links**");
    expect(renderCandidateBrief({ ...common, semanticSummaries: true })).toContain("**Expanded**");
  });

  it("keeps the default expanded section bounded while allowing a subscription override", () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      repo: `example/${index}`,
      source: "rss" as const,
      category: "article" as const,
      score: 30 - index,
      actors: ["Example"],
      eventTypes: ["article" as const],
      reasons: [],
      matchedInterests: ["agent"],
      events: [],
      label: `Article ${index}`,
      url: `https://example.com/${index}`,
    }));
    const common = {
      header: "# Brief",
      metadata: "10 updates",
      candidates,
      featuredTitle: "Expanded",
      compactTitle: "Quick links",
      emptyMessage: "Empty",
      pendingMessage: (count: number) => `${count} pending`,
    };

    expect(renderCandidateBrief(common)).not.toContain("Article 8");
    expect(renderCandidateBrief({ ...common, summaryLimit: 20 })).toContain("Article 9");
  });
});
