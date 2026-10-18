import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { Cause, Effect, Exit } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { SourceCatalogStore } from "../../application/ports.js";
import { SourceCatalogStoreLive } from "../live.js";

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

  it("keeps the Node message when reading a directory fails", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-catalog-"));
    directories.push(directory);
    const exit = await Effect.runPromise(
      Effect.provide(
        Effect.exit(
          Effect.gen(function* () {
            const store = yield* SourceCatalogStore;
            return yield* store.loadFeeds(directory);
          }),
        ),
        SourceCatalogStoreLive,
      ),
    );
    expectFileMessage(
      exit,
      nodeMessage(() => readFileSync(directory, "utf8")),
    );
  });

  it("keeps the Node message when writing the catalog fails", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-catalog-"));
    directories.push(directory);
    const exit = await Effect.runPromise(
      Effect.provide(
        Effect.exit(
          Effect.gen(function* () {
            const store = yield* SourceCatalogStore;
            yield* store.saveFeeds(directory, []);
          }),
        ),
        SourceCatalogStoreLive,
      ),
    );
    expectFileMessage(
      exit,
      nodeMessage(() => {
        mkdirSync(dirname(directory), { recursive: true });
        writeFileSync(directory, "unused");
      }),
    );
  });
});

function expectFileMessage(exit: Exit.Exit<unknown, unknown>, message: string): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  expect(Cause.hasDies(exit.cause)).toBe(false);
  const error = Cause.squash(exit.cause);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(message);
}

function nodeMessage(readOrWrite: () => void): string {
  try {
    readOrWrite();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the Node filesystem call to fail");
}
