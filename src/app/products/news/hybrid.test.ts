import { describe, expect, it, vi } from "vite-plus/test";
import { createGlmResearch, createHybridNewsSearch, type NewsSearchRequest } from "./hybrid.js";
import { DoubaoSearchError, type NewsSearchPage } from "../../../acquisition/index.js";
import type { ResearchPage } from "./hybrid.js";

const window = {
  since: Date.parse("2026-09-29T00:00:00+08:00"),
  until: Date.parse("2026-09-29T12:30:00+08:00"),
};
const request: NewsSearchRequest = {
  input: { query: "TypeScript release", count: 5, day: "2026-09-29", sourcePolicy: "official" },
  query: {
    id: "typescript",
    text: "TypeScript release",
    intent: "developer-change",
    subjectAny: ["TypeScript"],
    eventAny: ["release"],
    excludedAny: ["rumor"],
    glm: {
      query: "site:devblogs.microsoft.com TypeScript release",
      domains: ["devblogs.microsoft.com"],
    },
  },
  topic: {
    id: "tools",
    label: "开发工具",
    icon: "💻",
    enabled: true,
    maxItems: 2,
    sourcePolicy: "official",
    queries: [],
  },
};
const url = "https://devblogs.microsoft.com/typescript/announcement";
const article: ResearchPage = {
  title: "TypeScript release",
  url,
  content: "TypeScript release includes new compiler features.",
  truncated: false,
  publishedAt: "2026-09-29T01:00:00Z",
};
const empty: NewsSearchPage = { resultCount: 0, results: [] };
const candidate = { title: "TypeScript release", url, snippet: "TypeScript release" };
function setup(search = vi.fn(async (): Promise<NewsSearchPage> => empty)) {
  const glm = {
    search: vi.fn(async () => [candidate]),
    read: vi.fn(async (_url: string) => article),
  };
  return {
    search,
    glm,
    execute: createHybridNewsSearch({ search, glm, window, maxSearches: 4, maxReads: 6 }),
  };
}

describe("hybrid news search", () => {
  it.each(["local_budget_exhausted", "local_budget_state"])(
    "never falls back to GLM after %s",
    async (code) => {
      const { execute, glm } = setup(
        vi.fn(async () => {
          throw new DoubaoSearchError(code, "local spending boundary");
        }),
      );
      await expect(execute(request)).rejects.toMatchObject({ code });
      expect(glm.search).not.toHaveBeenCalled();
      expect(glm.read).not.toHaveBeenCalled();
    },
  );

  it("reuses an empty raw cache without spending GLM quota again", async () => {
    const searchUsage = {
      source: "cache" as const,
      fetchedAt: "2026-09-29T01:00:00Z",
      dailyUsed: 14,
      monthlyUsed: 420,
      dailyLimit: 14,
      monthlyLimit: 420,
    };
    const { execute, glm } = setup(vi.fn(async () => ({ ...empty, searchUsage })));
    expect(await execute(request)).toMatchObject({ provider: "doubao", searchUsage, results: [] });
    expect(glm.search).not.toHaveBeenCalled();
    expect(glm.read).not.toHaveBeenCalled();
  });

  it("keeps eligible Doubao results without spending GLM quota", async () => {
    const hit = {
      id: "d1",
      title: article.title,
      url,
      summary: article.content,
      publishTime: article.publishedAt,
      authInfoLevel: 1,
      rankPosition: 1,
    };
    const { execute, glm } = setup(vi.fn(async () => ({ resultCount: 1, results: [hit] })));
    expect(await execute(request)).toMatchObject({ provider: "doubao", results: [hit] });
    expect(glm.search).not.toHaveBeenCalled();
  });

  it("opens the quota circuit after 10406 and reuses verified Reader pages across queries", async () => {
    const { execute, search, glm } = setup(
      vi.fn(async (): Promise<NewsSearchPage> => {
        throw new DoubaoSearchError("10406", "quota exhausted");
      }),
    );
    const first = await execute(request);
    const second = await execute(request);
    expect(search).toHaveBeenCalledTimes(1);
    expect(glm.search).toHaveBeenCalledTimes(2);
    expect(glm.read).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      provider: "glm",
      fallback: { reason: "10406", searched: true, reads: 1 },
      results: [
        {
          url,
          publishTime: article.publishedAt,
          sourceVerification: { policy: "official", method: "configured-domain" },
        },
      ],
    });
    expect(first.results[0].authInfoLevel).toBeUndefined();
    expect(second.fallback?.reads).toBe(0);
  });

  it("merges fallback candidates when primary results fail the existing quality gates", async () => {
    const bad = {
      id: "bad",
      title: "irrelevant",
      url: "https://example.com/post",
      rankPosition: 1,
    };
    const { execute } = setup(vi.fn(async () => ({ resultCount: 1, results: [bad] })));
    expect(await execute(request)).toMatchObject({ provider: "mixed", results: [bad, { url }] });
  });

  it("keeps explicit official-source restrictions", async () => {
    const { execute, glm } = setup();
    glm.search.mockResolvedValue(
      ["https://devblogs.microsoft.com.evil.org/article", "https://other.com/article"].map(
        (url) => ({ ...candidate, url }),
      ),
    );
    expect((await execute(request)).results).toEqual([]);
    expect(glm.read).not.toHaveBeenCalled();
  });

  it("reads news candidates regardless of homepage, path or custom port", async () => {
    const { execute, glm } = setup();
    const urls = [
      "https://media.example.com/",
      "https://media.example.com/category/news",
      "https://media.example.com/tag/release",
      "https://media.example.com/feed/update",
      "https://media.example.com:8443/rss/update",
    ];
    glm.search.mockResolvedValue(urls.map((url) => ({ ...candidate, url })));
    glm.read.mockImplementation(async (url: string) => ({ ...article, url }));
    const result = await execute({ ...request, topic: { ...request.topic, sourcePolicy: "news" } });
    expect(glm.read.mock.calls.map(([url]) => url)).toEqual(urls);
    expect(result.results.map(({ url }) => url)).toEqual(urls);
    expect(result.fallback?.invalidLinks).toBe(0);
  });

  it("rejects missing timestamps, old articles and Reader redirects to other pages", async () => {
    for (const changes of [
      { publishedAt: undefined },
      { publishedAt: "2026-09-28T01:00:00Z" },
      { publishedAt: "2026-09-29T04:30:00Z" },
      { url: "https://devblogs.microsoft.com/" },
    ]) {
      const { execute, glm } = setup();
      glm.read.mockResolvedValue({ ...article, ...changes });
      expect((await execute(request)).results).toEqual([]);
    }
  });

  it("bounds searches and reads for the entire brief, and does not refetch failed URLs", async () => {
    const glm = {
      search: vi.fn(async (_query: string, _domains: string[]) => [
        candidate,
        { ...candidate, url: `${url}-2` },
      ]),
      read: vi.fn(async (): Promise<ResearchPage> => {
        throw new Error("unavailable");
      }),
    };
    const execute = createHybridNewsSearch({
      search: async () => empty,
      glm,
      window,
      maxSearches: 2,
      maxReads: 1,
    });
    await execute(request);
    await execute(request);
    const third = await execute(request);
    expect(glm.search).toHaveBeenCalledTimes(2);
    expect(glm.read).toHaveBeenCalledTimes(1);
    expect(third.fallback?.warnings).toContain("GLM 搜索预算已用完");
  });

  it("distinguishes both providers failing from a successful empty result", async () => {
    const { execute, glm } = setup(
      vi.fn(async (): Promise<NewsSearchPage> => {
        throw new DoubaoSearchError("network_error", "offline");
      }),
    );
    glm.search.mockRejectedValue(new Error("sensitive upstream details"));
    await expect(execute(request)).rejects.toMatchObject({ code: "hybrid_unavailable" });
    const workingPrimary = setup();
    workingPrimary.glm.search.mockRejectedValue(new Error("unavailable"));
    expect((await workingPrimary.execute(request)).fallback?.warnings).toContain(
      "GLM 搜索不可用，保留原搜索结果",
    );
  });

  it("requires explicit trusted-source configuration and propagates programming errors", async () => {
    const { execute, glm } = setup();
    await execute({ ...request, query: { ...request.query, glm: undefined } });
    expect(glm.search).not.toHaveBeenCalled();
    const broken = setup(
      vi.fn(async (): Promise<NewsSearchPage> => {
        throw new TypeError("bug");
      }),
    );
    await expect(broken.execute(request)).rejects.toThrow("bug");
    expect(broken.glm.search).not.toHaveBeenCalled();
  });
});

it("reserves every query a source search and Reader slot before a greedy first query", async () => {
  const ids = ["a", "b", "c"];
  const glm = {
    search: vi.fn(async (_query: string, _domains: string[]) => [
      candidate,
      { ...candidate, url: `${url}-2` },
    ]),
    read: vi.fn(async (url: string) => ({ ...article, url })),
  };
  const execute = createHybridNewsSearch({
    search: async () => empty,
    glm,
    window,
    maxSearches: 3,
    maxReads: 3,
    queryIds: ids,
  });
  for (const id of ids) {
    const page = await execute({
      ...request,
      query: {
        ...request.query,
        id,
        glm: {
          query: "release",
          domains: ["devblogs.microsoft.com", "example.com"],
          sourceQueries: { "devblogs.microsoft.com": "TypeScript release" },
        },
      },
    });
    expect(page.fallback?.sources).toEqual(["devblogs.microsoft.com"]);
    expect(page.fallback?.skippedSources).toEqual(["example.com"]);
  }
  expect(glm.search).toHaveBeenCalledTimes(3);
  expect(glm.search.mock.calls.every((call) => call[1].length === 1)).toBe(true);
  expect(glm.read).toHaveBeenCalledTimes(2);
});

it("rotates scarce budgets across runs instead of permanently skipping the final query", async () => {
  const searched: string[] = [];
  for (const rotation of [0, 1, 2]) {
    const execute = createHybridNewsSearch({
      search: async () => empty,
      glm: {
        search: async (query) => {
          searched.push(query);
          return [];
        },
        read: async () => article,
      },
      window,
      maxSearches: 1,
      maxReads: 1,
      queryIds: ["a", "b", "c"],
      rotation,
    });
    for (const id of ["a", "b", "c"])
      await execute({
        ...request,
        query: { ...request.query, id, glm: { query: id, domains: ["devblogs.microsoft.com"] } },
      });
  }
  expect(searched).toEqual(["a", "b", "c"]);
});

it("combined mode collects complementary evidence even after a valid primary hit", async () => {
  const primary = {
    id: "primary",
    title: article.title,
    url,
    summary: article.content,
    publishTime: article.publishedAt,
    authInfoLevel: 1,
    rankPosition: 1,
  };
  const glm = {
    search: vi.fn(async () => [{ ...candidate, url: `${url}-new` }]),
    read: async () => ({ ...article, url: `${url}-new` }),
  };
  const execute = createHybridNewsSearch({
    search: async () => ({ results: [primary], resultCount: 1 }),
    glm,
    window,
    maxSearches: 1,
    maxReads: 1,
    combine: true,
  });
  const page = await execute(request);
  expect(page.results).toHaveLength(2);
  expect(page.fallback?.reason).toBe("complement");
});

it("admits a media article in general news without domain restriction or invented authority", async () => {
  const mediaUrl = "https://news.example.com/technology/typescript-release";
  const glm = {
    search: vi.fn(async (_query: string, _domains: string[]) => [{ ...candidate, url: mediaUrl }]),
    read: async () => ({ ...article, url: mediaUrl }),
  };
  const execute = createHybridNewsSearch({
    search: async () => empty,
    glm,
    window,
    maxSearches: 1,
    maxReads: 1,
  });
  const page = await execute({
    ...request,
    topic: { ...request.topic, sourcePolicy: "news" },
    input: { ...request.input, sourcePolicy: "news" },
  });
  expect(glm.search.mock.calls[0][1]).toEqual([]);
  expect(page.results[0]).toMatchObject({
    url: mediaUrl,
    sourceVerification: { method: "article-read", policy: "news" },
  });
  expect(page.results[0].authInfoLevel).toBeUndefined();
});

function clientWith(payload: unknown, { sse = true, isError = false } = {}) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    const message = {
      jsonrpc: "2.0",
      id: request.id,
      result:
        request.method === "initialize"
          ? { protocolVersion: "2024-11-05" }
          : { isError, content: [{ type: "text", text: JSON.stringify(JSON.stringify(payload)) }] },
    };
    return new Response(
      sse
        ? `: heartbeat\r\n\r\nevent: message\r\ndata: ${JSON.stringify(message)}\r\n\r\n`
        : JSON.stringify(message),
      {
        headers: {
          "Content-Type": sse ? "text/event-stream" : "application/json",
          "Mcp-Session-Id": "test-session",
        },
      },
    );
  });
  return {
    client: createGlmResearch({ apiKey: "test-key", fetch: fetchMock as typeof fetch }),
    fetchMock,
  };
}

// The GLM research composition (acquisition search + reading) preserves the
// contract the deleted infrastructure facade carried.
describe("GLM research composition", () => {
  it("filters ignored upstream domain restrictions locally and deduplicates results", async () => {
    const { client, fetchMock } = clientWith([
      { title: "官方", link: "https://docs.example.com/post", content: "正文摘要" },
      { title: "重复", link: "https://docs.example.com/post" },
      { title: "外部", link: "https://csdn.net/post" },
      { title: "假域名", link: "https://example.com.evil.org/post" },
      { title: "后缀碰撞", link: "https://notexample.com/post" },
      { title: "私有", link: "http://127.0.0.1/post" },
      { title: "坏链接", link: "javascript:alert(1)" },
    ]);
    expect(await client.search("MCP 官方文档", ["example.com"])).toEqual([
      { title: "官方", url: "https://docs.example.com/post", snippet: "正文摘要" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const request = fetchMock.mock.calls[2]![1]!;
    expect(JSON.parse(String(request.body))).toMatchObject({
      method: "tools/call",
      params: { name: "web_search_prime" },
    });
    expect(request.redirect).toBe("error");
    expect(request.headers).toMatchObject({
      "Mcp-Session-Id": "test-session",
      "MCP-Protocol-Version": "2024-11-05",
    });
  });

  it("reads nested JSON payloads and bounds external text without inventing a summary", async () => {
    const { client } = clientWith(
      { title: "文章", url: "https://example.com/post", content: "文".repeat(17000) },
      { sse: false },
    );
    const page = await client.read("https://example.com/post");
    expect(page.content).toHaveLength(16000);
    expect(page).toMatchObject({ truncated: true, title: "文章", url: "https://example.com/post" });
  });

  it("rejects empty content and changed origins", async () => {
    await expect(
      clientWith({ content: "" }).client.read("https://example.com/post"),
    ).rejects.toThrow("no readable content");
    await expect(
      clientWith({ content: "text", url: "https://other.com/post" }).client.read(
        "https://example.com/post",
      ),
    ).rejects.toThrow("different source origin");
  });

  it("does not call the provider for private, credentialed or malformed targets", async () => {
    const { client, fetchMock } = clientWith({});
    for (const url of [
      "http://localhost/",
      "http://127.1/",
      "http://[::1]/",
      "file:///etc/passwd",
      "https://user:secret@example.com/",
      "https://intranet.local/",
    ]) {
      await expect(client.read(url)).rejects.toThrow("public HTTP");
    }
    await expect(client.search("query", ["example.com/path"])).rejects.toThrow("hostnames");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps public search and Reader URLs with custom ports", async () => {
    const url = "https://example.com:8443/category/news";
    const search = clientWith([{ title: "News", link: url }]);
    expect((await search.client.search("news", []))[0]?.url).toBe(url);
    const reader = clientWith({ title: "News", url, content: "News content" });
    expect((await reader.client.read(url)).url).toBe(url);
  });

  it("reports tool and HTTP errors without echoing provider credentials", async () => {
    await expect(
      clientWith("secret-provider-message", { isError: true }).client.read("https://example.com"),
    ).rejects.toThrow("GLM read tool failed.");
    const client = createGlmResearch({
      apiKey: "secret",
      fetch: vi.fn(async () => new Response("secret", { status: 401 })) as typeof fetch,
    });
    await expect(client.read("https://example.com")).rejects.toThrow("GLM MCP HTTP 401.");
  });

  it("bounds response size and rejects malformed responses", async () => {
    for (const body of [
      "not json",
      "x".repeat(2_000_001),
      JSON.stringify({ id: 99, result: {} }),
    ]) {
      const client = createGlmResearch({
        apiKey: "secret",
        fetch: vi.fn(async () => new Response(body)) as typeof fetch,
      });
      await expect(client.read("https://example.com")).rejects.toThrow(
        "size/time limits or was invalid",
      );
    }
  });

  it("uses one deadline across the operation and does not retry failed calls", async () => {
    const fetchMock = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("sensitive network error")),
            { once: true },
          );
        }),
    );
    const client = createGlmResearch({
      apiKey: "secret",
      timeoutMs: 10,
      fetch: fetchMock as typeof fetch,
    });
    await expect(client.read("https://example.com")).rejects.toThrow("timed out");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("preserves date precision and rejects ambiguous or modified-only dates", async () => {
  for (const metadata of [
    { "article:modified_time": "2026-09-29T09:00:00Z" },

    { datePublished: "2026-09-29T09:00:00" },
    { datePublished: "yesterday" },
    { datePublished: "2026-02-30T09:00:00Z" },
    { datePublished: "2026-09-29T24:00:00Z" },
    { datePublished: "2026-09-29T09:00:00Z", "article:published_time": "2026-09-28T09:00:00Z" },
  ]) {
    expect(
      (await clientWith({ content: "body", metadata }).client.read("https://example.com/article"))
        .publishedAt,
    ).toBeUndefined();
  }
  expect(
    (
      await clientWith({
        content: "body",
        metadata: { "article:published_time": "2026-09-29T09:00:00+08:00" },
      }).client.read("https://example.com/article")
    ).publishedAt,
  ).toBe("2026-09-29T01:00:00.000Z");
});

it("preserves a publication date without inventing a time", async () => {
  expect(
    (
      await clientWith({ content: "body", metadata: { datePublished: "2026-09-29" } }).client.read(
        "https://example.com/article",
      )
    ).publishedAt,
  ).toBe("2026-09-29");
});

it("passes source, week and region constraints and reports discarded raw hits", async () => {
  const { client, fetchMock } = clientWith([{ title: "outside", link: "https://other.com/post" }]);
  const observe = vi.fn();
  await client.search("release", ["example.com"], "oneWeek", observe, "us");
  expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).params.arguments).toMatchObject({
    search_domain_filter: "example.com",
    search_recency_filter: "oneWeek",
    location: "us",
  });
  expect(observe).toHaveBeenCalledWith({ rawResults: 1, domainRejected: 1 });
});

it("keeps media results and omits the provider domain filter for unrestricted news search", async () => {
  const { client, fetchMock } = clientWith([
    { title: "Media report", link: "https://media.example.com/news/story" },
  ]);
  expect(await client.search("news", [])).toHaveLength(1);
  expect(
    JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).params.arguments.search_domain_filter,
  ).toBeUndefined();
});
