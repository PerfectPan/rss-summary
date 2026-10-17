import { Effect } from "effect";
import { HttpClient } from "effect/http";

import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import {
  extractWebPageEntries,
  normalizeWebPageEntry,
} from "../../domain/item/adapters/web-page.js";
import type { WebPageSubscription } from "../../domain/source/subscription.js";
import { asError, provideHttp, timeoutFetch, webHeaders } from "./http.js";

export type WebPageClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
};

export class WebPageClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(options: WebPageClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async getEvents(source: WebPageSubscription): Promise<ActivityCardDto[]> {
    return Effect.runPromise(this.read(source));
  }

  /** Effect form so tests can drive the 250ms/500ms backoff with TestClock. */
  read(source: WebPageSubscription): Effect.Effect<ActivityCardDto[], Error> {
    const fetchImpl = timeoutFetch(this.fetchImpl, this.timeoutMs);
    const maxAttempts = this.maxAttempts;
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
}

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
