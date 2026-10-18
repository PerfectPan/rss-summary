import { describe, expect, it, vi } from "vite-plus/test";

import type { DigestDocument } from "../../../src/editorial/index.js";
import { createRivusSubscriptionExecutor } from "../../../src/app/rivus/phases.js";

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

  it("surfaces invalid summaries so the Agent can retry render", async () => {
    const collect = vi.fn(async () => ({ day: "2026-08-15", document: fixture() }));
    const execute = createRivusSubscriptionExecutor({ collect });
    const request = {
      occurrence: "2026-08-16T02:00:00.000Z",
      window: "previous-calendar-day",
    };
    const collected = await execute({ ...request, phase: "collect" });
    if (!("evidence" in collected)) throw new Error("collect phase did not return evidence");
    const selection = collected.evidence.map((item) => ({
      reason: item.kind === "article" ? "有明确技术变化" : "普通活动",
      ref: item.id,
      selected: item.kind === "article",
    }));

    try {
      await execute({
        ...request,
        phase: "render",
        selection,
        research: [
          {
            content: "正文说明 Deno 2.4 的运行时更新，并解释 TypeScript 工作流的变化。".repeat(20),
            ref: "publication:https://deno.com/blog/v2.4",
            status: "ok",
            url: "https://deno.com/blog/v2.4",
          },
        ],
        draft: [
          {
            ref: "publication:https://deno.com/blog/v2.4",
            summary: "a".repeat(181),
          },
        ],
      });
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toMatchObject({ code: "SUBSCRIPTION_SUMMARY_VALIDATION_FAILED" });
      expect((error as { issues: Array<{ message: string }> }).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining("too long") }),
        ]),
      );
    }
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

import type { DailyAiDigestResult } from "../../../src/app/products/daily-ai/flow.js";
import { createRivusDailyAiDigestExecutor } from "../../../src/app/rivus/phases.js";

describe("Rivus Daily AI Tool", () => {
  it("keeps every evidence item while storing bulky audits outside model messages", async () => {
    const fixture: DailyAiDigestResult = collectedFixture();
    fixture.evidence = Array.from({ length: 12 }, (_, index) => ({
      ...fixture.evidence[0]!,
      id: `official:release-${index}`,
      title: `Tool ${index} release`,
      url: `https://example.com/releases/${index}`,
      excerpt: "Concrete release details. ".repeat(1500).trim(),
    }));
    fixture.sourceAudit.industry = {
      version: 2,
      runId: "test",
      product: "frontier",
      generatedAt: fixture.generatedAt,
      sources: [{ id: "official", kind: "rss", name: "Official", status: "ok", itemCount: 12 }],
      counts: { fetched: 1012, inWindow: 1012, ranked: 1012, selected: 12, researchPending: 0 },
      candidates: Array.from({ length: 1000 }, (_, index) => ({
        key: `filtered-${index}`,
        label: "Unused candidate",
        score: 0,
        depth: "link",
        status: "filtered",
        reason: "Not publishable",
      })),
    };
    const saveDiagnostics = vi.fn(async () => {});
    const execute = createRivusDailyAiDigestExecutor({
      collect: async () => fixture,
      saveDiagnostics,
    });
    const occurrence = fixture.deliveryReceipt.occurrence;
    const collected = await execute({ occurrence, phase: "collect" });
    if (collected.phase !== "collect") throw new Error("Expected collect");
    expect(collected.evidence).toEqual(fixture.evidence);
    expect(collected.sourceAudit.industry).toEqual({
      counts: fixture.sourceAudit.industry.counts,
      sources: fixture.sourceAudit.industry.sources,
    });
    expect(saveDiagnostics).toHaveBeenCalledWith({ occurrence, phase: "collect", result: fixture });

    const rendered = await execute({
      occurrence,
      phase: "render",
      draft: fixture.evidence.map(({ id }, index) => ({
        category: "开发生态",
        headline: `工具 ${index} 增加新的调用功能`,
        refs: [id],
      })),
    });
    if (rendered.phase !== "render") throw new Error("Expected render");
    expect(rendered.itemCount).toBe(12);
    expect(rendered.deliveryReceipt.evidenceIds).toEqual(fixture.evidence.map(({ id }) => id));
    expect(rendered.markdown).toContain("工具 11 增加新的调用功能");
    expect(rendered).not.toHaveProperty("evidence");
    expect(rendered).not.toHaveProperty("sourceAudit");
    expect(rendered).not.toHaveProperty("items");
    expect(rendered.audit).not.toHaveProperty("decisions");
    expect(saveDiagnostics).toHaveBeenLastCalledWith({
      occurrence,
      phase: "render",
      result: expect.objectContaining({
        sourceAudit: fixture.sourceAudit,
        evidence: fixture.evidence,
        items: expect.any(Array),
        deliveryReceipt: rendered.deliveryReceipt,
      }),
    });
  });

  it("renders an intentionally empty selection without forcing release noise into delivery", async () => {
    const collect = vi.fn(async () => collectedFixture());
    const execute = createRivusDailyAiDigestExecutor({ collect, saveDiagnostics: async () => {} });
    const occurrence = "2026-08-11T01:00:00Z";
    await execute({ occurrence, phase: "collect" });
    const rendered = await execute({ occurrence, phase: "render", draft: [] });
    expect(rendered).toMatchObject({
      phase: "render",
      itemCount: 0,
      deliveryReceipt: { evidenceIds: [] },
    });
    expect("markdown" in rendered && rendered.markdown).toContain(
      "本日没有足够可信且具备明确事件信息",
    );
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("collects evidence before validating and rendering an editorial draft", async () => {
    const collect = vi.fn(async () => ({
      day: "2026-08-10",
      windowLabel: "2026-08-09 09:00–2026-08-10 09:00 +08:00",
      generatedAt: "2026-08-11T01:00:00Z",
      evidence: [
        {
          id: "official:openai-codex-2",
          title: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%",
          url: "https://openai.com/news/codex-2",
          publishedAt: "2026-08-10T03:00:00Z",
          excerpt: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%。",
          tier: "official" as const,
          sourceName: "OpenAI",
          topicId: "developer-tools",
        },
      ],
      items: [],
      warnings: [],
      sourceAudit: { xAccounts: [] },
      audit: { decisions: [], editorialIssues: [] },
      deliveryReceipt: {
        id: "daily-ai:2026-08-11",
        occurrence: "2026-08-11T01:00:00Z",
        evidenceIds: [],
        committed: false as const,
      },
    }));
    const execute = createRivusDailyAiDigestExecutor({ collect, saveDiagnostics: async () => {} });

    const collected = await execute({
      occurrence: "2026-08-11T01:00:00Z",
      phase: "collect",
    });
    expect(collected).toMatchObject({ phase: "collect", day: "2026-08-10" });
    expect("markdown" in collected).toBe(false);

    const rendered = await execute({
      occurrence: "2026-08-11T01:00:00Z",
      phase: "render",
      draft: [
        {
          category: "开发生态",
          headline: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%",
          refs: ["official:openai-codex-2"],
        },
      ],
    });
    expect(rendered).toMatchObject({ phase: "render", itemCount: 1 });
    expect("markdown" in rendered && rendered.markdown).toContain("OpenAI 发布 Codex 2.0");
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("renders valid items while reporting invalid siblings", async () => {
    const collect = vi.fn(async () => collectedFixture());
    const execute = createRivusDailyAiDigestExecutor({ collect, saveDiagnostics: async () => {} });

    await execute({ occurrence: "2026-08-11T01:00:00Z", phase: "collect" });
    const rendered = await execute({
      occurrence: "2026-08-11T01:00:00Z",
      phase: "render",
      draft: [
        {
          category: "开发生态",
          headline: "OpenAI 公布 Codex 2.0 的工具调用变化",
          refs: ["official:openai-codex-2"],
        },
        { category: "开发生态", headline: "无效引用", refs: ["missing"] },
      ],
    });

    expect(rendered).toMatchObject({
      phase: "render",
      itemCount: 1,
      audit: {
        editorialIssues: [expect.objectContaining({ reason: "unknown-reference" })],
      },
    });
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("keeps the collected snapshot when an all-invalid draft is retried", async () => {
    const collect = vi.fn(async () => collectedFixture());
    const execute = createRivusDailyAiDigestExecutor({ collect, saveDiagnostics: async () => {} });
    const occurrence = "2026-08-11T01:00:00Z";

    await execute({ occurrence, phase: "collect" });
    await expect(
      execute({
        occurrence,
        phase: "render",
        draft: [{ category: "unknown", headline: "无效", refs: ["missing"] }],
      }),
    ).rejects.toMatchObject({ code: "DAILY_AI_DRAFT_VALIDATION_FAILED" });

    const rendered = await execute({
      occurrence,
      phase: "render",
      draft: [
        {
          category: "开发生态",
          headline: "OpenAI 公布 Codex 2.0 的工具调用变化",
          refs: ["official:openai-codex-2"],
        },
      ],
    });

    expect(rendered).toMatchObject({ phase: "render", itemCount: 1 });
    expect(collect).toHaveBeenCalledTimes(1);
  });
});

function collectedFixture() {
  return {
    day: "2026-08-11",
    windowLabel: "2026-08-10 09:00–2026-08-11 09:00 +08:00",
    generatedAt: "2026-08-11T01:00:00Z",
    evidence: [
      {
        id: "official:openai-codex-2",
        title: "Codex 2.0",
        url: "https://openai.com/news/codex-2",
        publishedAt: "2026-08-10T03:00:00Z",
        excerpt: "Codex 2.0 tool calling changes.",
        tier: "official" as const,
        sourceName: "OpenAI",
      },
    ],
    items: [],
    warnings: [],
    sourceAudit: { xAccounts: [] },
    audit: { decisions: [], editorialIssues: [] },
    deliveryReceipt: {
      id: "daily-ai:2026-08-11",
      occurrence: "2026-08-11T01:00:00Z",
      evidenceIds: [],
      committed: false as const,
    },
  };
}
