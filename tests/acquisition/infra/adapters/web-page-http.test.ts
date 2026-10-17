import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { WebPageClient } from "../../../../src/acquisition/infra/adapters/web-page-http.js";
import type { WebPageSubscription } from "../../../../src/acquisition/domain/source/subscription.js";

const source: WebPageSubscription = {
  type: "page",
  name: "Example News",
  url: "https://example.com/news",
  pathPrefixes: ["/news/"],
  tags: ["AI", "News"],
};

const page = `<a href="/news/retry"><time datetime="2026-08-12">Aug 12</time>Retry succeeded</a>`;

describe("WebPageClient", () => {
  it("rejects parser drift instead of reporting a healthy empty source", async () => {
    const client = new WebPageClient({
      fetch: async () => new Response(`<a href="/news/no-date">No date</a>`),
    });

    await expect(client.getEvents(source)).rejects.toThrow("returned no dated links");
  });

  it("retries transient fetch failures but not permanent HTTP errors", async () => {
    let attempts = 0;
    const client = new WebPageClient({
      fetch: async () => {
        attempts += 1;
        if (attempts < 3) throw new TypeError("network reset");
        return new Response(page);
      },
    });

    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fiber = yield* client.read(source).pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          yield* TestClock.adjust("250 millis");
          expect(attempts).toBe(2);
          yield* TestClock.adjust("499 millis");
          expect(attempts).toBe(2);
          yield* TestClock.adjust("1 millis");
          return yield* Fiber.join(fiber);
        }),
        TestClock.layer(),
      ),
    );

    expect(events).toEqual([expect.objectContaining({ title: "Retry succeeded", source: "web" })]);
    expect(attempts).toBe(3);

    const blocked = new WebPageClient({
      fetch: async () => new Response("blocked", { status: 403 }),
    });
    await expect(blocked.getEvents(source)).rejects.toThrow("returned 403");
  });

  it("retries HTTP 500 on the same backoff and then accepts the page", async () => {
    let attempts = 0;
    const client = new WebPageClient({
      fetch: async () => {
        attempts += 1;
        if (attempts < 3) return new Response("unavailable", { status: 500 });
        return new Response(page);
      },
    });

    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fiber = yield* client.read(source).pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          expect(attempts).toBe(1);
          yield* TestClock.adjust("250 millis");
          expect(attempts).toBe(2);
          yield* TestClock.adjust("499 millis");
          expect(attempts).toBe(2);
          yield* TestClock.adjust("1 millis");
          return yield* Fiber.join(fiber);
        }),
        TestClock.layer(),
      ),
    );

    expect(events).toEqual([expect.objectContaining({ title: "Retry succeeded", source: "web" })]);
    expect(attempts).toBe(3);
  });

  it("retries HTTP 429 and does not retry 499 or other 4xx statuses", async () => {
    for (const status of [499, 400, 401, 403, 404, 422]) {
      let attempts = 0;
      const client = new WebPageClient({
        fetch: async () => {
          attempts += 1;
          return new Response("no", { status });
        },
      });
      await expect(client.getEvents(source)).rejects.toThrow(`returned ${status}`);
      expect(attempts).toBe(1);
    }

    let attempts = 0;
    const client = new WebPageClient({
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) return new Response("slow down", { status: 429 });
        return new Response(page);
      },
    });
    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fiber = yield* client.read(source).pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          expect(attempts).toBe(1);
          yield* TestClock.adjust("249 millis");
          expect(attempts).toBe(1);
          yield* TestClock.adjust("1 millis");
          return yield* Fiber.join(fiber);
        }),
        TestClock.layer(),
      ),
    );
    expect(events).toEqual([expect.objectContaining({ title: "Retry succeeded", source: "web" })]);
    expect(attempts).toBe(2);
  });
});
