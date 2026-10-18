import { Effect, Layer } from "effect";
import { HttpClient } from "effect/http";

import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import {
  extractWebPageEntries,
  normalizeWebPageEntry,
} from "../../domain/item/adapters/web-page.js";
import { acquireActivityCard } from "../../domain/item/adapters/scoring-trace.js";
import type { WebPageSubscription } from "../../domain/source/subscription.js";
import { WebPage } from "../../application/ports.js";
import { asError, provideHttp, timeoutFetch, webHeaders } from "./http.js";

export type WebPageOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
};

/** Fetch one listing page and map its dated links into activity cards. */
export function readWebPageEvents(
  source: WebPageSubscription,
  options: WebPageOptions = {},
): Effect.Effect<ActivityCardDto[], Error> {
  const fetchImpl = timeoutFetch(options.fetch ?? fetch, options.timeoutMs ?? 12_000);
  const maxAttempts = options.maxAttempts ?? 3;
  return Effect.gen(function* () {
    const html = yield* fetchHtml(source.url, maxAttempts);
    const entries = extractWebPageEntries(html, source);
    if (entries.length === 0) {
      return yield* Effect.fail(
        new Error(`Web page ${source.name} returned no dated links matching its path prefixes`),
      );
    }
    return entries.map((entry) => normalizeWebPageEntry(entry, source));
  }).pipe((effect) => provideHttp(effect, fetchImpl));
}

export const WebPageLive = (options: WebPageOptions = {}): Layer.Layer<WebPage> =>
  Layer.succeed(WebPage, {
    getEvents: (source) =>
      Effect.map(readWebPageEvents(source, options), (cards) => cards.map(acquireActivityCard)),
  });

function fetchHtml(
  url: string,
  maxAttempts: number,
): Effect.Effect<string, Error, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attempted = yield* Effect.result(readOnce(url));
      if (attempted._tag === "Failure") {
        const error = asError(attempted.failure);
        lastError = error;
        if (!isRetryableFetchError(error) || attempt === maxAttempts)
          return yield* Effect.fail(error);
      } else if (attempted.success.status < 200 || attempted.success.status >= 300) {
        const error = new Error(`Web page ${url} returned ${attempted.success.status}`);
        if (!isRetryableStatus(attempted.success.status) || attempt === maxAttempts) {
          return yield* Effect.fail(error);
        }
        lastError = error;
      } else {
        return yield* attempted.success.text.pipe(Effect.mapError(asError));
      }
      yield* Effect.sleep(250 * 2 ** (attempt - 1));
    }
    return yield* Effect.fail(
      lastError instanceof Error ? lastError : new Error(`Web page ${url} failed`),
    );
  });
}

function readOnce(url: string) {
  return Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    return yield* http.get(url, { headers: webHeaders });
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableFetchError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}
