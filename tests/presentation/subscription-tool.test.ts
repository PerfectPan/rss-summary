import { describe, expect, it, vi } from "vite-plus/test";

import type { DigestDocument } from "../../src/domain/digest.js";
import { createRivusSubscriptionExecutor } from "../../src/presentation/subscription-tool.js";

describe("subscription Tool editorial workflow", () => {
  it("reuses collected evidence and renders grounded AI summaries with repository facts", async () => {
    const collect = vi.fn(async () => ({ day: "2026-08-15", document: fixture() }));
    const execute = createRivusSubscriptionExecutor({ collect });
    const request = {
      occurrence: "2026-08-16T01:00:00.000Z",
      window: "previous-calendar-day",
    };

    const collected = await execute({ ...request, phase: "collect" });
    expect(collected).toMatchObject({
      phase: "collect",
      evidence: [
        expect.objectContaining({ kind: "repository", summaryPolicy: "none" }),
        expect.objectContaining({ kind: "article", summaryPolicy: "required" }),
      ],
    });

    const rendered = await execute({
      ...request,
      phase: "render",
      draft: [
        {
          ref: "rss-article:rss-1",
          summary: "文章介绍 Deno 2.4 的运行时更新，并解释 TypeScript 工作流的变化。",
        },
      ],
    });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(rendered).toMatchObject({ phase: "render", candidateCount: 2 });
    expect("markdown" in rendered ? rendered.markdown : "").toContain("⭐ 12.3k · TypeScript");
    expect("markdown" in rendered ? rendered.markdown : "").toContain(
      "文章介绍 Deno 2.4 的运行时更新",
    );
  });
});

function fixture(): DigestDocument {
  return {
    generatedAt: "2026-08-15T12:00:00Z",
    username: "PerfectPan",
    candidates: [
      {
        repo: "example/project",
        source: "github",
        category: "discovery",
        score: 90,
        actors: ["alice"],
        eventTypes: ["watch"],
        reasons: [],
        events: [
          {
            id: "star-1",
            type: "watch",
            actor: "alice",
            repo: "example/project",
            createdAt: "2026-08-15T09:00:00Z",
          },
        ],
        repository: {
          fullName: "example/project",
          htmlUrl: "https://github.com/example/project",
          description: "A useful project.",
          language: "TypeScript",
          stargazersCount: 12_345,
          topics: [],
          pushedAt: "2026-08-15T00:00:00Z",
        },
      },
      {
        repo: "rss:https://deno.com/blog/v2.4",
        source: "rss",
        category: "article",
        score: 30,
        actors: ["Deno Blog"],
        eventTypes: ["article"],
        reasons: [],
        events: [
          {
            id: "rss-1",
            type: "article",
            source: "rss",
            actor: "Deno Blog",
            repo: "rss:https://deno.com/blog/v2.4",
            createdAt: "2026-08-15T11:00:00Z",
            title: "Deno 2.4",
            summary: "Runtime updates for TypeScript and JavaScript.",
            htmlUrl: "https://deno.com/blog/v2.4",
          },
        ],
        label: "Deno 2.4",
        url: "https://deno.com/blog/v2.4",
        description: "Runtime updates for TypeScript and JavaScript.",
      },
    ],
  };
}
