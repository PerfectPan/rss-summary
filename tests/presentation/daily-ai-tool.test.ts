import { describe, expect, it, vi } from "vite-plus/test";

import type { DailyAiDigestResult } from "../../src/application/daily-ai-digest.js";
import { createRivusDailyAiDigestExecutor } from "../../src/presentation/daily-ai-tool.js";

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
