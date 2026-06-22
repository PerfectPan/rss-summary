import { describe, expect, it } from "vitest";

import { renderMarkdownDigest } from "../src/render.js";

describe("markdown digest renderer", () => {
  it("renders a concise project-focused digest", () => {
    const markdown = renderMarkdownDigest({
      generatedAt: "2026-06-22T10:00:00Z",
      username: "PerfectPan",
      candidates: [
        {
          repo: "BuilderIO/skills",
          category: "discovery",
          score: 135,
          actors: ["fi3ework"],
          eventTypes: ["watch"],
          reasons: ["followee starred this repository", "matches interest: skills"],
          events: [
            {
              id: "star-1",
              type: "watch",
              actor: "fi3ework",
              repo: "BuilderIO/skills",
              createdAt: "2026-06-22T09:47:11Z",
              action: "started",
            },
          ],
          repository: {
            fullName: "BuilderIO/skills",
            htmlUrl: "https://github.com/BuilderIO/skills",
            description: "Skills for coding agents",
            language: "JavaScript",
            stargazersCount: 2389,
            topics: ["skills"],
            pushedAt: "2026-06-22T02:55:49Z",
          },
        },
      ],
    });

    expect(markdown).toContain("# GitHub Feed Digest - 2026-06-22");
    expect(markdown).toContain("## 值得看");
    expect(markdown).toContain("[BuilderIO/skills](https://github.com/BuilderIO/skills)");
    expect(markdown).toContain("fi3ework");
    expect(markdown).toContain("Skills for coding agents");
  });
});
