import { describe, expect, it } from "vite-plus/test";

import { validateEditorialDraft, type DailyAiEvidence } from "../../../index.js";

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
});
