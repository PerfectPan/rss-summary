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
          category: "article",
          score: 60,
          actors: ["Official"],
          eventTypes: ["article"],
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
          category: "article",
          score: 30,
          actors: ["Official"],
          eventTypes: ["article"],
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
});
