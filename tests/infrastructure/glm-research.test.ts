import { describe, expect, it, vi } from "vite-plus/test";
import { GlmResearchClient } from "../../src/infrastructure/glm-research.js";

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
    client: new GlmResearchClient({ apiKey: "test-key", fetch: fetchMock as typeof fetch }),
    fetchMock,
  };
}

describe("GLM research MCP", () => {
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
      "https://example.com:8443/",
    ]) {
      await expect(client.read(url)).rejects.toThrow("public HTTP");
    }
    await expect(client.search("query", [])).rejects.toThrow("source domain");
    await expect(client.search("query", ["example.com/path"])).rejects.toThrow("hostnames");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports tool and HTTP errors without echoing provider credentials", async () => {
    await expect(
      clientWith("secret-provider-message", { isError: true }).client.read("https://example.com"),
    ).rejects.toThrow("GLM read tool failed.");
    const client = new GlmResearchClient({
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
      const client = new GlmResearchClient({
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
    const client = new GlmResearchClient({
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
