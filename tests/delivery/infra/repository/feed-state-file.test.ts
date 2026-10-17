import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createEmptyFeedState,
  FeedStateFileLive,
  FeedStateStore,
  loadFeedState,
} from "../../../../src/delivery/index.js";

const fixtureRoot = fileURLToPath(new URL("../../../fixtures/state/", import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("feed state file repository", () => {
  it("roundtrips the state fixtures byte for byte", async () => {
    for (const fixture of ["feed-state.json", "industry-state.json"]) {
      const bytes = readFileSync(join(fixtureRoot, fixture), "utf8");
      const target = join(newRoot(), fixture);

      const loaded = await run(
        FeedStateStore.use((store) => store.load(join(fixtureRoot, fixture))),
      );
      await run(FeedStateStore.use((store) => store.save(target, loaded)));

      expect(readFileSync(target, "utf8")).toBe(bytes);
    }
  });

  it("loads an empty state when the file does not exist", () => {
    expect(loadFeedState(join(newRoot(), "missing.json"))).toEqual(createEmptyFeedState());
  });

  it("fills in missing sections with empty objects", async () => {
    const path = join(newRoot(), "partial.json");
    writeFileSync(path, `${JSON.stringify({ seen: { "event-1": "2026-08-16T04:00:00.000Z" } })}\n`);

    const state = await run(FeedStateStore.use((store) => store.load(path)));

    expect(state).toEqual({ seen: { "event-1": "2026-08-16T04:00:00.000Z" }, researched: {} });
  });

  // The three cases below lock the historical lenient load behavior: sections
  // that are null become empty objects, malformed entries pass through
  // untouched, and unknown top-level fields are dropped on load.
  it("treats a null section as empty instead of rejecting the file", async () => {
    const path = join(newRoot(), "null-section.json");
    writeFileSync(path, `${JSON.stringify({ seen: null, researched: null })}\n`);

    const state = await run(FeedStateStore.use((store) => store.load(path)));

    expect(state).toEqual({ seen: {}, researched: {} });
  });

  it("passes malformed research records through untouched", async () => {
    const path = join(newRoot(), "malformed.json");
    const researched = { "github:owner/repo": { decision: "track" } };
    writeFileSync(path, `${JSON.stringify({ seen: {}, researched })}\n`);

    const state = await run(FeedStateStore.use((store) => store.load(path)));

    expect(state).toEqual({ seen: {}, researched });
  });

  it("drops unknown top-level fields when loading", async () => {
    const path = join(newRoot(), "extra-field.json");
    writeFileSync(path, `${JSON.stringify({ seen: {}, researched: {}, extra: 1 })}\n`);

    const state = await run(FeedStateStore.use((store) => store.load(path)));

    expect(state).toEqual({ seen: {}, researched: {} });
  });
});

function run<A, E>(effect: Effect.Effect<A, E, FeedStateStore>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, FeedStateFileLive));
}

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "rss-summary-feed-state-"));
  roots.push(root);
  return root;
}
