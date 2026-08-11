import { describe, expect, it } from "vite-plus/test";

import {
  buildDailyAiDigest,
  validateEditorialDraft,
  type DailyAiEvidence,
} from "../../src/domain/daily-ai.js";

const evidence = (overrides: Partial<DailyAiEvidence> = {}): DailyAiEvidence => ({
  id: "source-1",
  title: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%",
  url: "https://openai.com/news/codex-2",
  publishedAt: "2026-08-10T03:00:00.000Z",
  excerpt: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%。",
  tier: "official",
  sourceName: "OpenAI",
  topicId: "developer-tools",
  ...overrides,
});

describe("Daily AI editorial domain", () => {
  it("rejects unknown refs and hollow GitHub recommendation copy", () => {
    expect(() =>
      validateEditorialDraft(
        [
          {
            category: "概览/要闻",
            headline: "GitHub Home 在 GitHub Home 推荐了 demo/repo。",
            refs: ["missing"],
          },
        ],
        [evidence()],
      ),
    ).toThrow(/reference|事件句/u);
  });

  it("rejects editorial claims whose entity or numbers are absent from referenced evidence", () => {
    expect(() =>
      validateEditorialDraft(
        [
          {
            category: "模型发布",
            headline: "Anthropic 发布 Claude 6，推理成本降低 70%",
            refs: ["source-1"],
          },
        ],
        [evidence()],
      ),
    ).toThrow(/grounded|数字/u);

    expect(() =>
      validateEditorialDraft(
        [
          {
            category: "开发生态",
            headline: "OpenAI 发布 Codex 2.0，工具调用延迟降低 50%",
            refs: ["source-1"],
          },
        ],
        [evidence()],
      ),
    ).toThrow(/数字/u);
  });

  it("accepts grounded event verbs used by an editorial news briefing", () => {
    expect(
      validateEditorialDraft(
        [
          {
            category: "概览/要闻",
            headline: "OpenAI 为 Codex 添加机器可读标记",
            refs: ["source-1"],
          },
          {
            category: "开发生态",
            headline: "OpenAI 升级 Codex 工具调用链路",
            refs: ["source-1"],
          },
        ],
        [evidence({ excerpt: "OpenAI 为 Codex 添加机器可读标记，并升级工具调用链路。" })],
      ),
    ).toHaveLength(2);
  });

  it("merges the same entity event and keeps stable multi-source refs", () => {
    const result = buildDailyAiDigest([
      evidence(),
      evidence({
        id: "source-2",
        url: "https://github.com/openai/codex/releases/tag/v2",
        sourceName: "GitHub Releases",
      }),
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.refs).toEqual(["source-1", "source-2"]);
  });

  it("does not pad a low-quality day to twelve items", () => {
    const result = buildDailyAiDigest([evidence()]);
    expect(result.items).toHaveLength(1);
  });

  it("rejects invalid model output and falls back to an event-shaped source title", () => {
    const result = buildDailyAiDigest([evidence()], {
      draft: [{ category: "unknown", headline: "很重要的 AI 新闻", refs: ["source-1"] }],
    });
    expect(result.items[0]?.headline).toBe("OpenAI 发布 Codex 2.0，工具调用延迟降低 30%");
    expect(
      result.audit.decisions.some((decision) => decision.reason === "invalid-editorial-output"),
    ).toBe(true);
  });

  it("drops a repository description that has no event action", () => {
    const result = buildDailyAiDigest([
      evidence({
        title: "ProseMirror's document model",
        excerpt: "ProseMirror's document model",
        url: "https://github.com/ProseMirror/prosemirror-model",
      }),
    ]);
    expect(result.items).toEqual([]);
  });

  it("rejects aggregator-only evidence, invalid URLs, duplicate ids, and duplicate draft headlines", () => {
    const result = buildDailyAiDigest(
      [
        evidence({ id: "bad", url: "file:///tmp/private", tier: "official" }),
        evidence({ id: "agg", tier: "aggregator" }),
        evidence(),
        evidence({ title: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%" }),
      ],
      {
        draft: [
          {
            category: "开发生态",
            headline: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%",
            refs: ["source-1"],
          },
          {
            category: "开发生态",
            headline: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%",
            refs: ["source-1"],
          },
        ],
      },
    );
    expect(result.items).toHaveLength(1);
    expect(result.evidence.map(({ id }) => id)).toEqual(["agg", "source-1"]);
  });
});
