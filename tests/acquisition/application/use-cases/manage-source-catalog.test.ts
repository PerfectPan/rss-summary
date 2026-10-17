import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { SourceCatalogStore } from "../../../../src/acquisition/application/ports.js";
import {
  addCatalogFeed,
  listCatalogFeeds,
  removeCatalogFeed,
} from "../../../../src/acquisition/application/use-cases/manage-source-catalog.js";
import { SourceCatalogStoreLive } from "../../../../src/acquisition/infra/live.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("manage source catalog", () => {
  it("adds, lists, and removes a feed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-manage-"));
    directories.push(directory);
    const path = join(directory, "feeds.json");
    const run = <A>(effect: Effect.Effect<A, Error, SourceCatalogStore>) =>
      Effect.runPromise(Effect.provide(effect, SourceCatalogStoreLive));

    expect(await run(listCatalogFeeds(path))).toEqual([]);
    expect(
      await run(
        addCatalogFeed(path, {
          url: "https://example.com/feed.xml",
          name: "Example",
          tags: ["ai"],
        }),
      ),
    ).toEqual([{ name: "Example", url: "https://example.com/feed.xml", tags: ["ai"] }]);
    await expect(
      run(addCatalogFeed(path, { url: "https://example.com/feed.xml" })),
    ).rejects.toThrow("RSS feed already exists: https://example.com/feed.xml");
    expect(await run(removeCatalogFeed(path, "https://example.com/feed.xml"))).toEqual([]);
    await expect(run(removeCatalogFeed(path, "https://example.com/feed.xml"))).rejects.toThrow(
      "RSS feed not found: https://example.com/feed.xml",
    );
  });
});
