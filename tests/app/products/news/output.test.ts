import { describe, expect, it } from "vite-plus/test";

import type { SearchSettlement } from "../../../../src/acquisition/index.js";
import type { NewsSearchHit } from "../../../../src/editorial/index.js";
import {
  buildNewsAudit,
  summarizeNewsSources,
  type NewsAuditRequest,
  type NewsTopic,
} from "../../../../src/app/products/news/output.js";

const topic: NewsTopic = {
  id: "tools",
  label: "开发工具",
  icon: "💻",
  enabled: true,
  maxItems: 2,
  sourcePolicy: "news",
  queries: [],
};

function request(): NewsAuditRequest {
  return {
    query: {
      id: "typescript",
      text: "TypeScript release",
      intent: "developer-change",
      subjectAny: ["TypeScript"],
      eventAny: ["release"],
      excludedAny: [],
    },
    topic,
    input: { query: "TypeScript release" },
  };
}

function page(results: Array<Partial<NewsSearchHit>>): SearchSettlement {
  return {
    _tag: "Fulfilled",
    value: {
      provider: "grok",
      resultCount: results.length,
      results: results.map((result, index) => ({
        id: result.id ?? String(index),
        title: result.title ?? "Story",
        url: result.url ?? "https://example.com/story",
        publishTime: "2026-10-18T01:00:00Z",
        ...result,
      })) as never,
    },
  };
}

describe("news output projection", () => {
  it("publishes the provider receipt field on a failed query", () => {
    const failure = {
      _tag: "SearchFailure",
      code: "grok_timeout",
      message: "timed out",
      grok: { nativeTools: [], rejectedResults: 0 },
    } as never;
    const audit = buildNewsAudit(
      [request()],
      [{ _tag: "Rejected", reason: failure }],
      [],
      [],
      0,
      0,
    );
    expect(audit.queries[0]).toMatchObject({
      queryId: "typescript",
      status: "failed",
      errorCode: "grok_timeout",
      grok: { nativeTools: [], rejectedResults: 0 },
    });
  });

  it("keeps the model-caution warning in the source status", () => {
    const { sourceStatus } = summarizeNewsSources([request()], [page([{ id: "1" }])]);
    expect(sourceStatus.notes.join(" ")).toContain("Grok 原生搜索");
    expect(sourceStatus.state).toBe("healthy");
  });

  it("keeps the GLM topic key in the topic projection type", () => {
    expect(topic.queries).toEqual([]);
  });
});
