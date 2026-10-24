import { Deferred, Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { NewsSearchError, type SearchPage, type SearchResult } from "../../domain/search/index.js";
import { mergeSearches, type SearchSource } from "./merge-searches.js";

const input = {
  query: "OpenAI 发布 新模型",
  count: 10,
  day: "2026-10-24",
  sinceDay: "2026-10-24",
  sourcePolicy: "news" as const,
};

function result(id: string, url: string, overrides: Partial<SearchResult> = {}): SearchResult {
  return { id, title: id, url, rankPosition: 1, ...overrides };
}

function page(results: SearchResult[], overrides: Partial<SearchPage> = {}): SearchPage {
  return { provider: "primary", resultCount: results.length, results, ...overrides };
}

const failure = (code: string) => new NewsSearchError(code, `failure ${code}`);

describe("mergeSearches", () => {
  it("merges concurrent successes, deduplicates by canonical URL and keeps per-source order", async () => {
    const primary: SearchSource = {
      name: "primary",
      search: () =>
        Effect.succeed(
          page([
            result("shared", "https://example.com/shared"),
            result("primary-only", "https://example.com/primary", { rankPosition: 2 }),
          ]),
        ),
    };
    const supplement: SearchSource = {
      name: "supplement",
      search: () =>
        Effect.succeed(
          page(
            [
              // Tracking-parameter variant of the primary's first result.
              result("shared-dup", "https://example.com/shared?utm_source=feed"),
              result("supplement-only", "https://example.com/supplement", { rankPosition: 1 }),
            ],
            { provider: "supplement" },
          ),
        ),
    };

    const merged = await Effect.runPromise(mergeSearches([primary, supplement])(input));

    expect(merged.results.map(({ id, source }) => [id, source])).toEqual([
      ["shared", "primary"],
      ["primary-only", "primary"],
      ["supplement-only", "supplement"],
    ]);
    expect(merged.mergedSources).toEqual([
      { source: "primary", status: "ok", fetched: 2, contributed: 2 },
      { source: "supplement", status: "ok", fetched: 2, contributed: 1 },
    ]);
    expect(merged.resultCount).toBe(3);
    expect(merged.provider).toBe("primary");
    expect(merged.providerFallback).toBeUndefined();
  });

  it("succeeds through the supplement when the primary fails and records the primary code", async () => {
    const primary: SearchSource = {
      name: "primary",
      search: () => Effect.fail(failure("http_500")),
    };
    const supplement: SearchSource = {
      name: "supplement",
      search: () =>
        Effect.succeed(
          page([result("only", "https://example.com/only")], { provider: "supplement" }),
        ),
    };

    const merged = await Effect.runPromise(mergeSearches([primary, supplement])(input));

    expect(merged.provider).toBe("supplement");
    expect(merged.providerFallback).toEqual({ triggeredBy: "http_500" });
    expect(merged.mergedSources).toEqual([
      { source: "primary", status: "failed", fetched: 0, contributed: 0, code: "http_500" },
      { source: "supplement", status: "ok", fetched: 1, contributed: 1 },
    ]);
  });

  it("keeps the primary page when only the supplement fails", async () => {
    const primary: SearchSource = {
      name: "primary",
      search: () => Effect.succeed(page([result("only", "https://example.com/only")])),
    };
    const supplement: SearchSource = {
      name: "supplement",
      search: () => Effect.fail(failure("local_budget_exhausted")),
    };

    const merged = await Effect.runPromise(mergeSearches([primary, supplement])(input));

    expect(merged.provider).toBe("primary");
    expect(merged.providerFallback).toBeUndefined();
    expect(merged.mergedSources).toEqual([
      { source: "primary", status: "ok", fetched: 1, contributed: 1 },
      {
        source: "supplement",
        status: "failed",
        fetched: 0,
        contributed: 0,
        code: "local_budget_exhausted",
      },
    ]);
  });

  it("fails with the primary error only when every source fails", async () => {
    const primary: SearchSource = {
      name: "primary",
      search: () => Effect.fail(failure("grok_timeout")),
    };
    const supplement: SearchSource = {
      name: "supplement",
      search: () => Effect.fail(failure("http_429")),
    };

    const error = await Effect.runPromise(Effect.flip(mergeSearches([primary, supplement])(input)));

    expect(isSearchFailureCode(error)).toBe("grok_timeout");
  });

  it("rejects an empty source list", () => {
    expect(() => mergeSearches([])).toThrow("at least one source");
  });

  it("starts every source together instead of sequentially", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const primary: SearchSource = {
          name: "primary",
          search: () =>
            Effect.as(
              Deferred.await(gate),
              page([result("primary", "https://example.com/primary")]),
            ),
        };
        const supplement: SearchSource = {
          name: "supplement",
          // Completing the gate while the primary is still parked proves the
          // supplement started without waiting for the primary to finish.
          search: () => Effect.as(Deferred.succeed(gate, undefined), page([])),
        };
        const merged = yield* mergeSearches([primary, supplement])(input);
        expect(merged.mergedSources?.map(({ source }) => source)).toEqual([
          "primary",
          "supplement",
        ]);
      }),
    );
  });
});

function isSearchFailureCode(error: unknown): string | false {
  return error instanceof NewsSearchError ? error.code : false;
}
