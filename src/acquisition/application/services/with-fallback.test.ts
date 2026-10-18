import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  fallbackTriggerCodes,
  shouldFallbackOnSourceOutage,
  withFallback,
  type FallbackSearchProvider,
  type ProviderSearch,
} from "./with-fallback.js";
import { NewsSearchError, type SearchInput, type SearchPage } from "../../domain/search/index.js";

const input: SearchInput = {
  query: "OpenAI 新模型",
  count: 10,
  day: "2026-08-16",
  sourcePolicy: "news",
};

const page: SearchPage = { provider: "deepseek", resultCount: 0, results: [] };

function fallbackProvider(
  sourcePolicies: readonly SearchInput["sourcePolicy"][] = ["news", "authoritative"],
): FallbackSearchProvider & { search: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(() => Effect.succeed(page)),
    sourcePolicies,
  };
}

async function settle(
  effect: Effect.Effect<SearchPage, unknown>,
): Promise<{ ok: true; page: SearchPage } | { ok: false; error: unknown }> {
  return Effect.runPromise(effect).then(
    (page) => ({ ok: true as const, page }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

describe("withFallback", () => {
  it("hands source outages to the fallback and marks the trigger code", async () => {
    const fallback = fallbackProvider();
    const wrapped = withFallback(
      () => Effect.fail(new NewsSearchError("http_500", "HTTP 500")),
      fallback,
      shouldFallbackOnSourceOutage,
    );

    const outcome = await settle(wrapped(input));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.page).toEqual({ ...page, providerFallback: { triggeredBy: "http_500" } });
    }
    expect(fallback.search).toHaveBeenCalledWith(input);
  });

  it.each([
    ["local_budget_exhausted"],
    ["local_budget_state"],
    ["query_deferred"],
    ["rate_limit_exceeded"],
    ["http_402"],
  ])("never falls back on %s", async (code) => {
    const fallback = fallbackProvider();
    const wrapped = withFallback(
      () => Effect.fail(new NewsSearchError(code, "primary failed")),
      fallback,
      shouldFallbackOnSourceOutage,
    );

    const outcome = await settle(wrapped(input));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as NewsSearchError).code).toBe(code);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it("never falls back on a program error that is not a search failure", async () => {
    const fallback = fallbackProvider();
    const wrapped = withFallback(
      () => Effect.fail(new Error("programming error")),
      fallback,
      shouldFallbackOnSourceOutage,
    );

    const outcome = await settle(wrapped(input));

    expect(outcome.ok).toBe(false);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it("keeps the primary failure for source policies the fallback cannot serve", async () => {
    const fallback = fallbackProvider(["news", "authoritative"]);
    const wrapped = withFallback(
      () => Effect.fail(new NewsSearchError("http_500", "HTTP 500")),
      fallback,
      shouldFallbackOnSourceOutage,
    );

    const outcome = await settle(wrapped({ ...input, sourcePolicy: "official" }));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as NewsSearchError).code).toBe("http_500");
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it("reports the primary failure when the fallback fails too", async () => {
    const fallback: FallbackSearchProvider = {
      sourcePolicies: ["news", "authoritative"],
      search: () => Effect.fail(new NewsSearchError("network_error", "deepseek down")),
    };
    const wrapped = withFallback(
      () => Effect.fail(new NewsSearchError("http_503", "HTTP 503")),
      fallback,
      shouldFallbackOnSourceOutage,
    );

    const outcome = await settle(wrapped(input));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as NewsSearchError).code).toBe("http_503");
  });

  it("returns the primary page untouched on success", async () => {
    const fallback = fallbackProvider();
    const primaryPage: SearchPage = { resultCount: 1, results: [] };
    const wrapped = withFallback(
      () => Effect.succeed(primaryPage),
      fallback,
      shouldFallbackOnSourceOutage,
    );

    const outcome = await settle(wrapped(input));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.page).toBe(primaryPage);
    expect(fallback.search).not.toHaveBeenCalled();
  });
});

describe("shouldFallbackOnSourceOutage", () => {
  it("accepts every outage family, including the 5xx range", () => {
    for (const code of [
      "network_error",
      "http_429",
      "invalid_response",
      "grok_timeout",
      "grok_call_limit",
      "grok_output_limit",
      "grok_not_found",
      "grok_cli_failed",
      "grok_invalid_response",
      "grok_source_policy",
      "10406",
    ]) {
      expect(shouldFallbackOnSourceOutage(new NewsSearchError(code, "x"))).toBe(true);
    }
    expect(shouldFallbackOnSourceOutage(new NewsSearchError("http_500", "x"))).toBe(true);
    expect(shouldFallbackOnSourceOutage(new NewsSearchError("http_599", "x"))).toBe(true);
  });

  it("rejects non-outage codes, malformed codes and non-failures", () => {
    for (const code of [
      "http_499",
      "http_404",
      "http_50",
      "http_5000",
      "local_budget_exhausted",
      "local_budget_state",
      "query_deferred",
      "10407",
      "",
    ]) {
      expect(shouldFallbackOnSourceOutage(new NewsSearchError(code, "x"))).toBe(false);
    }
    expect(shouldFallbackOnSourceOutage(new Error("plain"))).toBe(false);
    expect(shouldFallbackOnSourceOutage(undefined)).toBe(false);
  });

  it("keeps the trigger list free of local boundaries", () => {
    expect(fallbackTriggerCodes).not.toContain("local_budget_exhausted");
    expect(fallbackTriggerCodes).not.toContain("local_budget_state");
    expect(fallbackTriggerCodes).not.toContain("query_deferred");
  });
});

// The decorator must accept the port-shaped providers used in app wiring.
const typeCheck: ProviderSearch = withFallback(
  () => Effect.succeed(page),
  { search: () => Effect.succeed(page), sourcePolicies: ["news"] },
  shouldFallbackOnSourceOutage,
);
void typeCheck;
