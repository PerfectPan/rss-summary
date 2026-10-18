import { describe, expect, it, vi } from "vite-plus/test";

import { readGlmPage } from "./glm-reader.js";

function pageWith(payload: unknown, { sse = true, isError = false } = {}) {
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
  return { fetchMock };
}

describe("GLM reader", () => {
  it("reads nested JSON payloads and bounds external text", async () => {
    const { fetchMock } = pageWith(
      { title: "文章", url: "https://example.com/post", content: "文".repeat(17000) },
      { sse: false },
    );
    const page = await readGlmPage("https://example.com/post", {
      apiKey: "test-key",
      fetch: fetchMock as typeof fetch,
    });
    expect(page.content).toHaveLength(16000);
    expect(page).toMatchObject({ truncated: true, title: "文章", url: "https://example.com/post" });
  });

  it("rejects empty content, changed origins and missing credentials", async () => {
    await expect(
      readGlmPage("https://example.com/post", {
        apiKey: "test-key",
        fetch: pageWith({ content: "" }).fetchMock as typeof fetch,
      }),
    ).rejects.toThrow("no readable content");
    await expect(
      readGlmPage("https://example.com/post", {
        apiKey: "test-key",
        fetch: pageWith({ content: "text", url: "https://other.com/post" })
          .fetchMock as typeof fetch,
      }),
    ).rejects.toThrow("different source origin");
    await expect(readGlmPage("https://example.com/post", { apiKey: "  " })).rejects.toThrow(
      "GLM_CODING_API_KEY is required",
    );
  });

  it("reports tool failure without echoing provider credentials", async () => {
    await expect(
      readGlmPage("https://example.com", {
        apiKey: "secret",
        fetch: pageWith("secret-provider-message", { isError: true }).fetchMock as typeof fetch,
      }),
    ).rejects.toThrow("GLM read tool failed.");
  });
});
