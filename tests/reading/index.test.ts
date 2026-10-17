import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import { readOriginal, ReadingLive } from "../../src/reading/index.js";

describe("ReadingLive", () => {
  it("wires HTTP extraction for an explicit http read", async () => {
    const result = await Effect.runPromise(
      readOriginal({
        glmFallback: false,
        mode: "http",
        ref: "article:1",
        url: "https://example.com/article",
      }).pipe(
        Effect.provide(
          ReadingLive({
            fetch: async () =>
              new Response(
                `<article><h1>Useful article</h1><p>${"Grounded content. ".repeat(10)}</p></article>`,
                { headers: { "content-type": "text/html" } },
              ),
            now: () => new Date("2026-08-17T01:00:00.000Z"),
          }),
        ),
      ),
    );
    expect(result).toMatchObject({
      fetchedUrl: "https://example.com/article",
      method: "http",
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "ok",
      title: "Useful article",
    });
  });
});
