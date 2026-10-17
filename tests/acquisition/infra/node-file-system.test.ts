import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect, FileSystem } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { NodeFileSystemLive } from "../../../src/acquisition/infra/node-file-system.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("node file system", () => {
  it("creates, writes, and reads through the FileSystem port", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-fs-"));
    directories.push(directory);
    const path = join(directory, "nested", "note.txt");
    const text = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(join(directory, "nested"), { recursive: true });
          yield* fs.writeFileString(path, "hello\n");
          return yield* fs.readFileString(path);
        }),
        NodeFileSystemLive,
      ),
    );
    expect(text).toBe("hello\n");
  });
});
