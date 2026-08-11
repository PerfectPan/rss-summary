import { describe, expect, it, vi } from "vite-plus/test";

import { createRivusDailyAiDigestExecutor } from "../../src/presentation/daily-ai-tool.js";

describe("Rivus Daily AI Tool", () => {
  it("collects evidence before validating and rendering an editorial draft", async () => {
    const collect = vi.fn(async () => ({
      day: "2026-08-10",
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
      audit: { decisions: [] },
      deliveryReceipt: {
        id: "daily-ai:2026-08-11",
        occurrence: "2026-08-11T01:00:00Z",
        evidenceIds: [],
        committed: false as const,
      },
    }));
    const execute = createRivusDailyAiDigestExecutor({ collect });

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
});
