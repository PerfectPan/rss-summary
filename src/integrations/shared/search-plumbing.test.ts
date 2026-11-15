import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { NewsSearchError, SearchProvider, type SearchPage } from "../../acquisition/index.js";
import { errorText, postSearchJson, searchProviderLayer } from "./search-plumbing.js";

const fail = (code: string, message: string, options?: { retryAfterMs?: number }): NewsSearchError =>
  new NewsSearchError(code, message, options);

const page: SearchPage = { resultCount: 0, results: [] };

describe("search plumbing", () => {
  it("reads the message of an Error and stringifies the rest", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("plain")).toBe("plain");
  });

  it("posts a Bearer JSON body under the timeout and reports HTTP failures as the provider's error", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 429, headers: { "Retry-After": "3" } });
    }) as typeof fetch;

    await expect(
      postSearchJson({
        url: "https://api.example/search",
        apiKey: "k",
        timeoutMs: 5,
        body: { a: 1 },
        fetchImpl,
        error: fail
      })
    ).rejects.toMatchObject({ code: "http_429", retryAfterMs: 3_000 });
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Bearer k", "Content-Type": "application/json" });

    await expect(
      postSearchJson({
        url: "https://api.example/search",
        apiKey: "k",
        timeoutMs: 5,
        body: {},
        fetchImpl: (async () => new Response("{}", { status: 500 })) as typeof fetch,
        error: fail
      })
    ).rejects.toMatchObject({ code: "http_500" });
  });

  it("reports a rejected request as network_error and hands the response back on success", async () => {
    await expect(
      postSearchJson({
        url: "https://api.example/search",
        apiKey: "k",
        timeoutMs: 5,
        body: {},
        fetchImpl: (async () => {
          throw new Error("offline");
        }) as typeof fetch,
        error: fail
      })
    ).rejects.toMatchObject({ code: "network_error" });

    const { response, retryAfterMs } = await postSearchJson({
      url: "https://api.example/search",
      apiKey: "k",
      timeoutMs: 5,
      body: {},
      fetchImpl: (async () => new Response("{}")) as typeof fetch,
      error: fail
    });
    expect(await response.json()).toEqual({});
    expect(retryAfterMs).toBeUndefined();
  });

  it("exposes the client's search through the Effect layer, checking its failures", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* SearchProvider;
      return yield* provider.search({ query: "q", count: 1, day: "2026-01-01", sourcePolicy: "news" });
    });
    const client = { search: (): Promise<SearchPage> => Promise.resolve(page) };
    await expect(Effect.runPromise(Effect.provide(program, searchProviderLayer(client)))).resolves.toBe(page);

    const failing = {
      search: (): Promise<SearchPage> => Promise.reject("not an error instance")
    };
    await expect(Effect.runPromise(Effect.provide(program, searchProviderLayer(failing)))).rejects.toMatchObject({
      message: "not an error instance"
    });
  });
});
