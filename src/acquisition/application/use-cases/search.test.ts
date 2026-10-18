import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { settleSearches } from "./search.js";
import type { SearchPage } from "../../domain/search/search.js";

const page = (id: string): SearchPage => ({ resultCount: 0, results: [], logId: id });

describe("settleSearches", () => {
  it("starts only the first concurrency window", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = Effect.runPromise(
      settleSearches(
        ["a", "b", "c"],
        () =>
          Effect.promise(async () => {
            started += 1;
            await gate;
            return page("held");
          }),
        2,
      ),
    );
    await Promise.resolve();
    expect(started).toBe(2);
    release();
    await pending;
    expect(started).toBe(3);
  });

  it("isolates a failure without dropping the other requests", async () => {
    const error = new Error("boom");
    const settled = await Effect.runPromise(
      settleSearches(
        ["a", "b", "c"],
        (id) => (id === "b" ? Effect.fail(error) : Effect.succeed(page(id))),
        1,
      ),
    );
    expect(settled).toEqual([
      { _tag: "Fulfilled", value: page("a") },
      { _tag: "Rejected", reason: error },
      { _tag: "Fulfilled", value: page("c") },
    ]);
  });
});
