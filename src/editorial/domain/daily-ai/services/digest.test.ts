import { describe, expect, it } from "vite-plus/test";

import { buildDailyAiDigest, type DailyAiEvidence } from "../../../index.js";

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

  it("allows the editor to reject every low-information candidate", () => {
    const result = buildDailyAiDigest(
      [evidence({ title: "0.163.0-alpha.6", excerpt: "Release 0.163.0-alpha.6" })],
      { draft: [] },
    );
    expect(result.items).toEqual([]);
    expect(result.audit.decisions).toContainEqual({
      evidenceIds: ["source-1"],
      status: "filtered",
      reason: "not-selected-by-editorial-draft",
    });
    expect(result.audit.editorialIssues).toEqual([]);
  });

  it("preserves valid selected events beyond eight without a count quota", () => {
    const sources = Array.from({ length: 9 }, (_, index) =>
      evidence({
        id: `source-${index}`,
        title: `Event ${index}`,
        url: `https://example.com/${index}`,
      }),
    );
    const result = buildDailyAiDigest(sources, {
      draft: sources.map(({ id, title }) => ({
        category: "开发生态",
        headline: title,
        refs: [id],
      })),
    });
    expect(result.items).toHaveLength(9);
    expect(result.audit.decisions.at(-1)).toMatchObject({
      evidenceIds: ["source-8"],
      status: "selected",
    });
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

  it("drops invalid evidence URLs and duplicate evidence ids", () => {
    const result = buildDailyAiDigest([
      evidence({ id: "bad", url: "file:///tmp/private" }),
      evidence(),
      evidence({ title: "duplicate id" }),
    ]);

    expect(result.evidence.map(({ id }) => id)).toEqual(["source-1"]);
  });
});
