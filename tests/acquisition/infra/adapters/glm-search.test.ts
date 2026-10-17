import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { SearchProvider } from "../../../../src/acquisition/application/ports.js";
import {
  GlmSearchClient,
  GlmSearchLive,
} from "../../../../src/acquisition/infra/adapters/glm-search.js";
import { describeSearchProvider, type ProviderStep } from "./search-provider-suite.js";

function fetchFor(step: ProviderStep): typeof fetch {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (step === "http_429") throw new Error("glm transport cannot emit http_429");
    if (step === "permanent") return new Response("no", { status: 500 });
    const request = JSON.parse(String(init?.body)) as { method?: string; id?: number };
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    const payload = [{ title: "Suite", link: "https://example.com/suite", content: "正文" }];
    const message = {
      jsonrpc: "2.0",
      id: request.id,
      result:
        request.method === "initialize"
          ? { protocolVersion: "2024-11-05" }
          : {
              isError: false,
              content: [{ type: "text", text: JSON.stringify(JSON.stringify(payload)) }],
            },
    };
    return new Response(JSON.stringify(message), {
      headers: { "Content-Type": "application/json", "Mcp-Session-Id": "suite" },
    });
  }) as typeof fetch;
}

describe("GLM search", () => {
  it("reports a tool failure and maps a page that is not a cacheable provider", async () => {
    const failing = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method?: string; id?: number };
      if (request.method === "notifications/initialized")
        return new Response(null, { status: 202 });
      const message = {
        jsonrpc: "2.0",
        id: request.id,
        result:
          request.method === "initialize"
            ? { protocolVersion: "2024-11-05" }
            : { isError: true, content: [] },
      };
      return new Response(JSON.stringify(message), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new GlmSearchClient({ apiKey: "suite", fetch: failing as typeof fetch });
    await expect(client.search("suite query", [])).rejects.toThrow("GLM search tool failed.");

    const page = await new GlmSearchClient({
      apiKey: "suite",
      fetch: fetchFor("ok"),
    }).searchPage({
      query: "suite",
      count: 1,
      day: "2026-08-16",
      sourcePolicy: "news",
    });
    expect(page).toMatchObject({
      provider: "glm",
      resultCount: 1,
      results: [{ title: "Suite", url: "https://example.com/suite", rankPosition: 1 }],
    });
    expect(page.results[0]).not.toHaveProperty("sourceVerification");
  });
});

describeSearchProvider({
  name: "glm",
  emitsRateLimit: false,
  create(next) {
    let invocations = 0;
    return {
      invocations: () => invocations,
      search: (input) => {
        invocations += 1;
        const step = next();
        return Effect.gen(function* () {
          const provider = yield* SearchProvider;
          return yield* provider.search(input);
        }).pipe(Effect.provide(GlmSearchLive({ apiKey: "suite", fetch: fetchFor(step) })));
      },
    };
  },
});
