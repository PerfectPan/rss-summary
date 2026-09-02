import { describe, expect, it } from "vite-plus/test";

import {
  buildDailyAiDigest,
  DailyAiDraftValidationError,
  validateEditorialDraft,
  type DailyAiEvidence,
} from "../../src/domain/daily-ai.js";

const evidence = (overrides: Partial<DailyAiEvidence> = {}): DailyAiEvidence => ({
  id: "source-1",
  title: "Path to Astra",
  url: "https://openai.com/index/path-to-astra",
  publishedAt: "2026-09-01T13:00:00.000Z",
  excerpt: "OpenAI says Astra meets the Critical cybersecurity capability threshold.",
  tier: "official",
  sourceName: "OpenAI",
  topicId: "developer-tools",
  ...overrides,
});

describe("Daily AI editorial domain", () => {
  it("validates only structural fields and known evidence references", () => {
    const result = validateEditorialDraft(
      [
        {
          category: "行业动态",
          headline: "梅卡曼德在港交所主板挂牌上市",
          refs: ["source-1"],
        },
        {
          category: "模型发布",
          headline: "Astra 全面可用，默认要求采用更严格的安全措施",
          refs: ["source-1"],
        },
      ],
      [evidence()],
    );

    expect(result).toMatchObject({ issues: [], items: expect.any(Array) });
    expect(result.items).toHaveLength(2);
  });

  it("keeps valid items when another editorial item is invalid", () => {
    const result = buildDailyAiDigest([evidence()], {
      draft: [
        {
          category: "模型发布",
          headline: "OpenAI 公布 Astra 的关键网络安全能力与发布保障",
          refs: ["source-1"],
        },
        {
          category: "模型发布",
          headline: "引用不存在的候选",
          refs: ["missing"],
        },
      ],
    });

    expect(result.items).toEqual([
      {
        category: "模型发布",
        headline: "OpenAI 公布 Astra 的关键网络安全能力与发布保障",
        refs: ["source-1"],
      },
    ]);
    expect(result.audit.editorialIssues).toEqual([
      expect.objectContaining({ index: 1, reason: "unknown-reference" }),
    ]);
  });

  it("fails generation instead of rendering no-news when every draft item is invalid", () => {
    expect(() =>
      buildDailyAiDigest([evidence()], {
        draft: [{ category: "unknown", headline: "Astra", refs: ["missing"] }],
      }),
    ).toThrow(DailyAiDraftValidationError);
  });

  it("fails an empty editorial draft when evidence exists", () => {
    expect(() => buildDailyAiDigest([evidence()], { draft: [] })).toThrow(
      /at least one valid item/u,
    );
  });

  it("does not invent fallback copy before the editorial phase", () => {
    const result = buildDailyAiDigest([evidence()]);

    expect(result.items).toEqual([]);
    expect(result.audit.editorialIssues).toEqual([]);
  });

  it("merges duplicate evidence while retaining every cited source", () => {
    const result = buildDailyAiDigest(
      [
        evidence(),
        evidence({
          id: "source-2",
          url: "https://github.com/openai/astra",
          sourceName: "GitHub Releases",
        }),
      ],
      {
        draft: [
          {
            category: "模型发布",
            headline: "OpenAI 公布 Astra 的关键网络安全能力与发布保障",
            refs: ["source-1", "source-2"],
          },
        ],
      },
    );

    expect(result.items[0]?.refs).toEqual(["source-1", "source-2"]);
    expect(result.audit.decisions).toContainEqual({
      evidenceIds: ["source-2"],
      status: "merged",
      reason: "merged-with:source-1",
    });
  });

  it("rejects malformed items independently and deduplicates accepted headlines", () => {
    const result = validateEditorialDraft(
      [
        {
          category: "模型发布",
          headline: "OpenAI 公布 Astra",
          refs: ["source-1"],
        },
        {
          category: "模型发布",
          headline: "OpenAI 公布 Astra",
          refs: ["source-1"],
        },
        { category: "unknown", headline: "错误栏目", refs: ["source-1"] },
        { category: "模型发布", headline: "", refs: ["source-1"] },
      ],
      [evidence()],
    );

    expect(result.items).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.objectContaining({ index: 2, reason: "invalid-category" }),
      expect.objectContaining({ index: 3, reason: "invalid-headline" }),
    ]);
  });

  it("drops invalid evidence URLs and duplicate evidence ids", () => {
    const result = buildDailyAiDigest([
      evidence({ id: "bad", url: "file:///tmp/private" }),
      evidence(),
      evidence({ title: "duplicate id" }),
    ]);

    expect(result.evidence.map(({ id }) => id)).toEqual(["source-1"]);
  });
});
