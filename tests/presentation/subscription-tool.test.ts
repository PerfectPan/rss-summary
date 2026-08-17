import { describe, expect, it, vi } from "vite-plus/test";

import type { DigestDocument } from "../../src/domain/digest.js";
import { createRivusSubscriptionExecutor } from "../../src/presentation/subscription-tool.js";

describe("subscription Tool editorial workflow", () => {
  it("reuses collected evidence, applies AI selection, and renders grounded summaries", async () => {
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

    if (!("evidence" in collected)) throw new Error("collect phase did not return evidence");
    const selection = collected.evidence.map((item) => ({
      reason: item.kind === "article" ? "新版本文章有明确技术变化" : "普通活动不值得推送",
      ref: item.id,
      selected: item.kind === "article",
    }));
    const selected = await execute({ ...request, phase: "select", selection });
    expect(selected).toMatchObject({ phase: "select", selectedCount: 1 });

    const rendered = await execute({
      ...request,
      phase: "render",
      selection,
      research: [
        {
          content:
            "正文解释 Deno 2.4 的运行时更新，并说明 TypeScript 工作流的变化；同时列出运行时、工具链和兼容性方面的具体变化，方便读者判断升级影响。".repeat(
              2,
            ),
          ref: "publication:https://deno.com/blog/v2.4",
          status: "ok",
          title: "Deno 2.4 正文",
          url: "https://deno.com/blog/v2.4",
        },
      ],
      draft: [
        {
          ref: "publication:https://deno.com/blog/v2.4",
          summary: "正文解释 Deno 2.4 的运行时更新，并说明 TypeScript 工作流的变化。",
        },
      ],
    });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(rendered).toMatchObject({ phase: "render", candidateCount: 1, selectedCount: 1 });
    expect(rendered).toMatchObject({
      audit: { counts: { selected: 1 }, editorialSelection: { selectedCount: 1 } },
    });
    expect("markdown" in rendered ? rendered.markdown : "").not.toContain("⭐ 12.3k · TypeScript");
    expect("markdown" in rendered ? rendered.markdown : "").toContain(
      "正文解释 Deno 2.4 的运行时更新",
    );
  });

  it("suppresses a selected item when both research paths fail", async () => {
    const collect = vi.fn(async () => ({ day: "2026-08-15", document: fixture() }));
    const execute = createRivusSubscriptionExecutor({ collect });
    const request = {
      occurrence: "2026-08-16T01:00:00.000Z",
      window: "previous-calendar-day",
    };
    const collected = await execute({ ...request, phase: "collect" });
    if (!("evidence" in collected)) throw new Error("collect phase did not return evidence");
    const selection = collected.evidence.map((item) => ({
      reason: "文章有明确技术变化",
      ref: item.id,
      selected: item.kind === "article",
    }));

    const rendered = await execute({
      ...request,
      phase: "render",
      selection,
      research: [
        {
          error: "browser: timeout; http: 403",
          ref: "publication:https://deno.com/blog/v2.4",
          status: "failed",
          url: "https://deno.com/blog/v2.4",
        },
      ],
    });

    expect(rendered).toMatchObject({ candidateCount: 0, phase: "render", selectedCount: 0 });
    expect("selection" in rendered ? rendered.selection : []).toContainEqual(
      expect.objectContaining({
        reason: "研究正文缺失或抓取失败，已取消推送",
        ref: "publication:https://deno.com/blog/v2.4",
        selected: false,
      }),
    );
  });
});

function fixture(): DigestDocument {
  return {
    audit: {
      candidates: [],
      counts: { fetched: 2, inWindow: 2, ranked: 2, researchPending: 0, selected: 2 },
      generatedAt: "2026-08-15T12:00:00Z",
      product: "subscriptions",
      runId: "run-fixture",
      sources: [],
      version: 2,
      windowLabel: "2026-08-15",
    },
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
