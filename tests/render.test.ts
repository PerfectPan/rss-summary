import { describe, expect, it } from "vitest";

import { renderJsonDigest, renderMarkdownDigest } from "../src/render.js";

describe("markdown digest renderer", () => {
  it("renders a concise project-focused digest", () => {
    const markdown = renderMarkdownDigest({
      generatedAt: "2026-06-22T10:00:00Z",
      username: "PerfectPan",
      candidates: [
        {
          repo: "BuilderIO/skills",
          source: "github",
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
        {
          repo: "rss:https://deno.com/blog/v2.4",
          source: "rss",
          category: "article",
          score: 70,
          actors: ["Deno Blog"],
          eventTypes: ["article"],
          reasons: ["rss feed: Deno Blog", "matches interest: deno"],
          events: [
            {
              id: "rss-1",
              type: "article",
              source: "rss",
              actor: "Deno Blog",
              repo: "rss:https://deno.com/blog/v2.4",
              createdAt: "2026-06-22T08:00:00Z",
              title: "Deno 2.4",
              htmlUrl: "https://deno.com/blog/v2.4",
            },
          ],
          label: "Deno 2.4",
          url: "https://deno.com/blog/v2.4",
          description: "Runtime updates for TypeScript and JavaScript.",
        },
      ],
    });

    expect(markdown).toContain("# 每日技术情报 · 2026-06-22");
    expect(markdown).toContain("## 值得看");
    expect(markdown).toContain("[BuilderIO/skills](https://github.com/BuilderIO/skills)");
    expect(markdown).toContain("## RSS 文章");
    expect(markdown).toContain("[Deno 2.4](https://deno.com/blog/v2.4)");
    expect(markdown).toContain("fi3ework");
    expect(markdown).toContain("Skills for coding agents");
  });

  it("keeps RSS articles visible when GitHub activity has higher scores", () => {
    const markdown = renderMarkdownDigest({
      generatedAt: "2026-06-22T10:00:00Z",
      username: "PerfectPan",
      candidates: [
        ...Array.from({ length: 12 }, (_, index) => ({
          repo: `example/repo-${index}`,
          source: "github" as const,
          category: "activity" as const,
          score: 100 - index,
          actors: ["followee"],
          eventTypes: ["pull_request" as const],
          reasons: ["followed actor: followee"],
          events: [
            {
              id: `pr-${index}`,
              type: "pull_request" as const,
              actor: "followee",
              repo: `example/repo-${index}`,
              createdAt: "2026-06-22T08:00:00Z",
            },
          ],
        })),
        {
          repo: "rss:https://deno.com/blog/v2.4",
          source: "rss",
          category: "article",
          score: 10,
          actors: ["Deno Blog"],
          eventTypes: ["article"],
          reasons: ["rss feed: Deno Blog"],
          events: [
            {
              id: "rss-1",
              type: "article",
              source: "rss",
              actor: "Deno Blog",
              repo: "rss:https://deno.com/blog/v2.4",
              createdAt: "2026-06-22T08:00:00Z",
            },
          ],
          label: "Deno 2.4",
          url: "https://deno.com/blog/v2.4",
        },
      ],
    });

    expect(markdown).toContain("## RSS 文章");
    expect(markdown).toContain("[Deno 2.4](https://deno.com/blog/v2.4)");
  });

  it("renders machine-readable JSON for research skills", () => {
    const json = renderJsonDigest({
      generatedAt: "2026-06-22T10:00:00Z",
      username: "PerfectPan",
      windowLabel: "2026-06-22 +08:00",
      candidates: [
        {
          repo: "rss:https://deno.com/blog/v2.4",
          source: "rss",
          category: "article",
          score: 70,
          actors: ["Deno Blog"],
          eventTypes: ["article"],
          reasons: ["rss feed: Deno Blog"],
          events: [
            {
              id: "rss-1",
              type: "article",
              source: "rss",
              actor: "Deno Blog",
              repo: "rss:https://deno.com/blog/v2.4",
              createdAt: "2026-06-22T08:00:00Z",
              title: "Deno 2.4",
              htmlUrl: "https://deno.com/blog/v2.4",
            },
          ],
          label: "Deno 2.4",
          url: "https://deno.com/blog/v2.4",
        },
      ],
    });

    expect(JSON.parse(json)).toMatchObject({
      username: "PerfectPan",
      windowLabel: "2026-06-22 +08:00",
      candidates: [{ source: "rss", label: "Deno 2.4" }],
    });
  });

  it("shows the event window in markdown output", () => {
    const markdown = renderMarkdownDigest({
      generatedAt: "2026-06-22T10:00:00Z",
      username: "PerfectPan",
      windowLabel: "2026-06-22 +08:00",
      candidates: [],
    });

    expect(markdown).toContain("筛选窗口：2026-06-22 +08:00");
  });

  it("labels RSS-only output without showing a GitHub account", () => {
    const markdown = renderMarkdownDigest({
      generatedAt: "2026-06-22T10:00:00Z",
      username: "PerfectPan",
      sourceMode: "rss",
      candidates: [],
    });

    expect(markdown).toContain("来源模式：RSS only");
    expect(markdown).not.toContain("GitHub 账号：PerfectPan");
  });
});
