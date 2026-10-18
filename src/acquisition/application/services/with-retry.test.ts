import { Effect, Fiber, Random } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { retryDelayMs, retryEffect, searchWithRetry } from "./with-retry.js";
import { NewsSearchError, type SearchInput } from "../../domain/search/index.js";

const input: SearchInput = {
  query: "retry",
  count: 1,
  day: "2026-08-16",
  sourcePolicy: "news",
};
const page = { resultCount: 0, results: [] };

describe("search retry delay", () => {
  it.each([
    { random: 0, attempt: 1, retryAfterMs: undefined, delay: 125 },
    { random: 0, attempt: 2, retryAfterMs: undefined, delay: 250 },
    { random: 0.5, attempt: 1, retryAfterMs: undefined, delay: 250 },
    { random: 1, attempt: 1, retryAfterMs: undefined, delay: 375 },
    { random: 1, attempt: 2, retryAfterMs: undefined, delay: 750 },
    { random: 0, attempt: 1, retryAfterMs: 1500, delay: 1500 },
  ])(
    "attempt $attempt random $random waits $delay ms",
    ({ random, attempt, retryAfterMs, delay }) => {
      expect(
        retryDelayMs(retryAfterMs === undefined ? {} : { retryAfterMs }, attempt, () => random),
      ).toBe(delay);
    },
  );

  it.each([
    { random: 0, retryAfterMs: undefined, delays: [125, 250] },
    { random: 0.5, retryAfterMs: undefined, delays: [250, 500] },
    { random: 1, retryAfterMs: undefined, delays: [375, 750] },
    { random: 0, retryAfterMs: 1500, delays: [1500, 1500] },
  ])("TestClock sleeps $delays for random $random", async ({ random, retryAfterMs, delays }) => {
    let attempts = 0;
    const error = new NewsSearchError(
      "http_429",
      "rate limit",
      retryAfterMs === undefined ? {} : { retryAfterMs },
    );
    const program = Effect.gen(function* () {
      const fiber = yield* retryEffect(async () => {
        attempts += 1;
        if (attempts < 3) throw error;
        return page;
      }).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      expect(attempts).toBe(1);
      for (const delay of delays) {
        const before = attempts;
        yield* TestClock.adjust(`${delay - 1} millis`);
        yield* Effect.yieldNow;
        expect(attempts).toBe(before);
        yield* TestClock.adjust("1 millis");
        yield* Effect.yieldNow;
        expect(attempts).toBe(before + 1);
      }
      return yield* Fiber.join(fiber);
    });

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.provideService(program, Random.Random, {
          nextDoubleUnsafe: () => random,
          nextIntUnsafe: () => 0,
        }),
        TestClock.layer(),
      ),
    );
    expect(result).toEqual(page);
    expect(attempts).toBe(3);
  });

  it("uses the injected clock for the same delays and does not retry other errors", async () => {
    const delays: number[] = [];
    let attempts = 0;
    await Effect.runPromise(
      searchWithRetry(
        input,
        async () => {
          attempts += 1;
          if (attempts < 3) throw new NewsSearchError("rate_limit_exceeded", "limited");
          return page;
        },
        {
          random: () => 0,
          sleep: async (milliseconds) => {
            delays.push(milliseconds);
          },
        },
      ),
    );
    expect(delays).toEqual([125, 250]);

    const permanent = new Error("invalid query configuration");
    await expect(
      Effect.runPromise(
        searchWithRetry(input, async () => {
          throw permanent;
        }),
      ),
    ).rejects.toBe(permanent);

    const quota = new NewsSearchError("10406", "quota");
    await expect(
      Effect.runPromise(
        searchWithRetry(input, async () => {
          throw quota;
        }),
      ),
    ).rejects.toBe(quota);
  });
});
