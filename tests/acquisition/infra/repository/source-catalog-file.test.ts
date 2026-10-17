import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { SourceCatalogStore } from "../../../../src/acquisition/application/ports.js";
import { SourceCatalogStoreLive } from "../../../../src/acquisition/infra/live.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("source catalog file", () => {
  it("reads a missing file as an empty list and writes the historical JSON document", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-catalog-"));
    directories.push(directory);
    const path = join(directory, "nested", "feeds.json");
    const feeds = [{ name: "Example", url: "https://example.com/feed.xml", tags: ["ai"] }];
    const loaded = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SourceCatalogStore;
          expect(yield* store.loadFeeds(join(directory, "missing.json"))).toEqual([]);
          yield* store.saveFeeds(path, feeds);
          return yield* store.loadFeeds(path);
        }),
        SourceCatalogStoreLive,
      ),
    );
    expect(loaded).toEqual(feeds);
    expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(feeds, null, 2)}\n`);
  });
});
