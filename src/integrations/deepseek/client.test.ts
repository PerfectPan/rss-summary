import { describe, expect, it, vi } from "vite-plus/test";

import { DeepSeekSearchClient, validateDeepSeekInput } from "./client.js";

const searchUrl = "https://api.deepseek.com/v1/tools/search";

const resultPayload = {
  results: [
    {
      rerank_score: 2.4,
      title: "OpenAI 正式发布新模型",
      url: "https://openai.com/news/new-model",
      snippet: "OpenAI announced a new model.",
      summary: "OpenAI 正式发布新模型，并开放 API。",
      content: "",
      site_name: "OpenAI",
      site_icon: null,
      date: "2026-08-16T02:00:00Z",
      authority: 3,
    },
  ],
};

describe("DeepSeek search source", () => {
  it("posts the query and count with the bearer key and a deepseek provider page", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(resultPayload), { status: 200 }),
    );
    const client = new DeepSeekSearchClient({ apiKey: "test-key", fetch });

    const page = await client.search({
      query: "OpenAI 正式发布新模型",
      count: 10,
      day: "2026-08-16",
      sourcePolicy: "news",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(searchUrl);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "OpenAI 正式发布新模型",
      count: 10,
    });
    expect(page).toEqual({
      provider: "deepseek",
      resultCount: 1,
      results: [
        {
          id: "deepseek:https://openai.com/news/new-model",
          title: "OpenAI 正式发布新模型",
          url: "https://openai.com/news/new-model",
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
  });

  it("requires a non-empty key", () => {
    expect(() => new DeepSeekSearchClient({ apiKey: "  " })).toThrow(
      "DEEPSEEK_API_KEY is required.",
    );
  });

  it("rejects an oversized query before any request leaves", async () => {
    const fetch = vi.fn();
    const client = new DeepSeekSearchClient({ apiKey: "test-key", fetch });
    await expect(
      client.search({
        query: "x".repeat(129),
        count: 10,
        day: "2026-08-16",
        sourcePolicy: "news",
      }),
    ).rejects.toThrow(/1 to 128 characters/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps HTTP 429, server errors, network failures and undecodable bodies", async () => {
    const input = {
      query: "科技新闻",
      count: 10,
      day: "2026-08-16",
      sourcePolicy: "news" as const,
    };
    const rateLimited = new DeepSeekSearchClient({
      apiKey: "test-key",
      fetch: async () => new Response("slow", { status: 429, headers: { "Retry-After": "2" } }),
    });
    const serverError = new DeepSeekSearchClient({
      apiKey: "test-key",
      fetch: async () => new Response(null, { status: 503 }),
    });
    const offline = new DeepSeekSearchClient({
      apiKey: "test-key",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const malformed = new DeepSeekSearchClient({
      apiKey: "test-key",
      fetch: async () => new Response("not json", { status: 200 }),
    });

    await expect(rateLimited.search(input)).rejects.toMatchObject({
      code: "http_429",
      retryAfterMs: 2_000,
      message: "DeepSeek search API error http_429: HTTP 429",
    });
    await expect(serverError.search(input)).rejects.toMatchObject({ code: "http_503" });
    await expect(offline.search(input)).rejects.toMatchObject({
      code: "network_error",
      message: "DeepSeek search API error network_error: fetch failed",
    });
    await expect(malformed.search(input)).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("validateDeepSeekInput", () => {
  const base = { query: "OpenAI 新模型", count: 10 };

  it("accepts documented bounds", () => {
    expect(() => validateDeepSeekInput({ ...base, query: "x".repeat(128) })).not.toThrow();
    expect(() => validateDeepSeekInput({ ...base, count: 1 })).not.toThrow();
    expect(() => validateDeepSeekInput({ ...base, count: 50 })).not.toThrow();
  });

  it("rejects empty and oversized queries instead of truncating them", () => {
    expect(() => validateDeepSeekInput({ ...base, query: "  " })).toThrowError(
      /1 to 128 characters/,
    );
    expect(() => validateDeepSeekInput({ ...base, query: "x".repeat(129) })).toThrowError(
      /1 to 128 characters/,
    );
  });

  it("rejects counts outside 1..50", () => {
    expect(() => validateDeepSeekInput({ ...base, count: 0 })).toThrowError(/1 and 50/);
    expect(() => validateDeepSeekInput({ ...base, count: 51 })).toThrowError(/1 and 50/);
    expect(() => validateDeepSeekInput({ ...base, count: 2.5 })).toThrowError(/1 and 50/);
  });
});
