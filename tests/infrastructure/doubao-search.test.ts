import { describe, expect, it, vi } from "vite-plus/test";

import { DoubaoSearchClient, DoubaoSearchError } from "../../src/infrastructure/doubao-search.js";

describe("Doubao search source", () => {
  it("requests an exact day without broad query rewriting and with authoritative URL results", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ResponseMetadata: { RequestId: "request-1" },
            Result: {
              LogId: "log-1",
              ResultCount: 1,
              TimeCost: 42,
              WebResults: [
                {
                  Id: "result-1",
                  SortId: 1,
                  Title: "Agent platform release",
                  SiteName: "Example News",
                  Url: "https://example.com/agent?utm_source=search",
                  Summary: "A new agent platform was released.",
                  PublishTime: "2026-07-29T09:30:00+08:00",
                  RankScore: 0.95,
                  AuthInfoDes: "正常权威",
                  AuthInfoLevel: 2,
                },
              ],
            },
          }),
          { status: 200 },
        ),
    );
    const client = new DoubaoSearchClient({ apiKey: "test-key", fetch });

    const page = await client.search({
      query: "AI Agent 大模型重要发布",
      count: 10,
      day: "2026-07-29",
      sourcePolicy: "authoritative",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://open.feedcoopapi.com/search_api/web_search");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      Query: "AI Agent 大模型重要发布",
      SearchType: "web",
      Count: 10,
      Filter: { NeedUrl: true },
      TimeRange: "2026-07-29..2026-07-29",
      QueryControl: { QueryRewrite: false },
      ContentFormats: "markdown",
    });
    expect(page).toMatchObject({ logId: "log-1", resultCount: 1, timeCostMs: 42 });
    expect(page.results[0]).toMatchObject({ id: "result-1", authInfoLevel: 2, rankPosition: 1 });
  });

  it("uses the API's official-only filter for political news", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ ResponseMetadata: {}, Result: { WebResults: [] } }), {
          status: 200,
        }),
    );
    const client = new DoubaoSearchClient({ apiKey: "test-key", fetch });

    await client.search({
      query: "中国重要政策与政治新闻",
      count: 10,
      day: "2026-07-29",
      sourcePolicy: "official",
    });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      Filter: { AuthInfoLevel: 1, NeedUrl: true },
    });
  });

  it("surfaces API errors without exposing the credential", async () => {
    const client = new DoubaoSearchClient({
      apiKey: "secret-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            ResponseMetadata: { Error: { Code: "10406", Message: "quota exhausted" } },
            Result: null,
          }),
          { status: 200 },
        ),
    });

    await expect(
      client.search({
        query: "科技新闻",
        count: 10,
        day: "2026-07-29",
        sourcePolicy: "authoritative",
      }),
    ).rejects.toThrow(/10406.*quota exhausted/i);
    await expect(
      client.search({
        query: "科技新闻",
        count: 10,
        day: "2026-07-29",
        sourcePolicy: "authoritative",
      }),
    ).rejects.not.toThrow(/secret-key/i);
  });

  it("preserves transient rate-limit metadata and Retry-After", async () => {
    const client = new DoubaoSearchClient({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            ResponseMetadata: {
              Error: { Code: "rate_limit_exceeded", Message: "rate limit exceeded" },
            },
          }),
          { headers: { "Retry-After": "2" }, status: 200 },
        ),
    });

    const error = await client
      .search({
        query: "科技新闻",
        count: 10,
        day: "2026-07-29",
        sourcePolicy: "authoritative",
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(DoubaoSearchError);
    expect(error).toMatchObject({ code: "rate_limit_exceeded", retryAfterMs: 2_000 });
  });
});
