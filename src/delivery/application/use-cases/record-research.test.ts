import { describe, expect, it } from "vite-plus/test";
import { Effect, Layer } from "effect";

import {
  createEmptyFeedState,
  FeedStateStore,
  recordResearch,
  type FeedState,
} from "../../index.js";

describe("record research", () => {
  it("records every suggestion under one timestamp and saves the state", async () => {
    const saved: Array<{ path: string; state: FeedState }> = [];
    const state = createEmptyFeedState();
    state.researched["rss:https://example.com/old"] = { at: "2026-06-01T00:00:00Z" };

    await Effect.runPromise(
      Effect.provide(
        recordResearch({
          stateFile: ".state/feed-state.json",
          suggestions: [
            { key: "github:owner/repo", decision: "track", reason: "good" },
            { key: "rss:https://example.com/a", decision: "read" },
          ],
          at: "2026-07-01T00:00:00Z",
        }),
        storeLayer(state, saved),
      ),
    );

    expect(saved).toHaveLength(1);
    const written = saved[0]!.state;
    expect(written.researched["github:owner/repo"]).toEqual({
      at: "2026-07-01T00:00:00Z",
      decision: "track",
      reason: "good",
    });
    expect(written.researched["rss:https://example.com/a"]).toEqual({
      at: "2026-07-01T00:00:00Z",
      decision: "read",
    });
    // The pre-existing record is preserved untouched.
    expect(written.researched["rss:https://example.com/old"]).toEqual({
      at: "2026-06-01T00:00:00Z",
    });
  });

  it("propagates load failures without saving", async () => {
    const saved: Array<{ path: string; state: FeedState }> = [];

    await expect(
      Effect.runPromise(
        Effect.provide(
          recordResearch({
            stateFile: "missing.json",
            suggestions: [{ key: "github:owner/repo", decision: "track" }],
            at: "2026-07-01T00:00:00Z",
          }),
          Layer.succeed(FeedStateStore, {
            load: () => Effect.fail(new Error("state unreadable")),
            save: (path, state) =>
              Effect.sync(() => {
                saved.push({ path, state });
              }),
          }),
        ),
      ),
    ).rejects.toThrow("state unreadable");
    expect(saved).toHaveLength(0);
  });
});

function storeLayer(
  state: FeedState,
  saved: Array<{ path: string; state: FeedState }>,
): Layer.Layer<FeedStateStore> {
  return Layer.succeed(FeedStateStore, {
    load: () => Effect.succeed(state),
    save: (path, next) =>
      Effect.sync(() => {
        saved.push({ path, state: next });
      }),
  });
}
