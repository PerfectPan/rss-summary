import { describe, expect, it } from "vite-plus/test";

import { DeepSeekSearchError, parseDeepSeekResponse } from "./dto.js";

function payload(overrides: Record<string, unknown> = {}, results: unknown[] = [defaultResult()]) {
  return {
    results: results.map((result) => ({ ...(result as Record<string, unknown>), ...overrides })),
  };
}

function defaultResult(): Record<string, unknown> {
  return {
    rerank_score: 2.4,
    title: "OpenAI 正式发布新模型",
    url: "https://openai.com/news/new-model?utm_source=search",
    snippet: "OpenAI announced a new model.",
    summary: "OpenAI 正式发布新模型，并开放 API。",
    content: "",
    site_name: "OpenAI",
    site_icon: null,
    date: "2026-08-16T02:00:00Z",
    authority: 3,
  };
}

describe("DeepSeek search response adapter", () => {
  it("maps a result page onto the search and item models", () => {
    const acquired = parseDeepSeekResponse(payload());

    expect(acquired.page).toEqual({
      provider: "deepseek",
      resultCount: 1,
      results: [
        {
          id: "deepseek:https://openai.com/news/new-model",
          title: "OpenAI 正式发布新模型",
          url: "https://openai.com/news/new-model?utm_source=search",
          siteName: "OpenAI",
          snippet: "OpenAI announced a new model.",
          summary: "OpenAI 正式发布新模型，并开放 API。",
          publishTime: "2026-08-16T02:00:00Z",
          rankScore: 2.4,
          authority: 3,
          rankPosition: 1,
        },
      ],
    });
    expect(acquired.items[0]).toMatchObject({
      id: "deepseek:https://openai.com/news/new-model",
      kind: "publication",
      publishedAt: { value: "2026-08-16T02:00:00Z", precision: "instant" },
      credibility: { tier: "authoritative" },
      rank: { position: 1, score: 2.4 },
      display: {
        label: "OpenAI",
        reference: "https://openai.com/news/new-model?utm_source=search",
        facts: [],
      },
    });
  });

  it("carries Beijing-midnight dates as day precision with the Beijing day", () => {
    const acquired = parseDeepSeekResponse(
      payload({}, [{ ...defaultResult(), date: "2026-08-16T16:00:00Z" }]),
    );
    expect(acquired.page.results[0]).toMatchObject({
      publishTime: "2026-08-17",
      publishDay: { day: "2026-08-17", timezoneOffset: "+08:00" },
    });
    expect(acquired.items[0]).toMatchObject({
      publishedAt: { value: "2026-08-17", precision: "date" },
    });
  });

  it("keeps a stable id across tracking-parameter variants", () => {
    const first = parseDeepSeekResponse(
      payload({}, [{ ...defaultResult(), url: "https://openai.com/news/new-model" }]),
    );
    const second = parseDeepSeekResponse(
      payload({}, [{ ...defaultResult(), url: "https://openai.com/news/new-model?from=feed" }]),
    );
    expect(first.page.results[0]?.id).toBe(second.page.results[0]?.id);
  });

  it("ranks by response order and tolerates null metadata", () => {
    const acquired = parseDeepSeekResponse(
      payload({}, [
        defaultResult(),
        {
          ...defaultResult(),
          url: "https://example.com/second",
          site_name: null,
          date: null,
          authority: -1,
        },
      ]),
    );
    expect(acquired.page.results.map(({ rankPosition }) => rankPosition)).toEqual([1, 2]);
    expect(acquired.page.results[1]).toEqual({
      id: "deepseek:https://example.com/second",
      title: "OpenAI 正式发布新模型",
      url: "https://example.com/second",
      snippet: "OpenAI announced a new model.",
      summary: "OpenAI 正式发布新模型，并开放 API。",
      rankScore: 2.4,
      authority: -1,
      rankPosition: 2,
    });
    expect(acquired.items[1]).toMatchObject({
      publishedAt: { value: "", precision: "date" },
      credibility: { tier: "unrated" },
    });
  });

  it("drops records that violate the documented contract without losing the page", () => {
    const acquired = parseDeepSeekResponse(
      payload({}, [
        defaultResult(),
        { ...defaultResult(), url: "https://example.com/bad-authority", authority: 7 },
        { ...defaultResult(), url: "" },
        "not-a-record",
      ]),
    );
    expect(acquired.page.resultCount).toBe(1);
    expect(acquired.page.results[0]?.url).toBe(
      "https://openai.com/news/new-model?utm_source=search",
    );
  });

  it("rejects a response without a results array as invalid_response", () => {
    expect(() => parseDeepSeekResponse({ error: { message: "no key" } })).toThrowError(
      DeepSeekSearchError,
    );
    expect(() => parseDeepSeekResponse({ results: "no" })).toThrowError(/invalid_response/);
    expect(() => parseDeepSeekResponse([])).toThrowError(
      /DeepSeek search API error invalid_response/,
    );
  });
});
