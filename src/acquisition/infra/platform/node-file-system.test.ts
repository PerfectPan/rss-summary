import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Cause, Effect, Exit, FileSystem, PlatformError } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { NodeFileSystemLive } from "./node-file-system.js";

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

  it("fails a directory read as a typed platform error carrying the Node message", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-fs-"));
    directories.push(directory);
    const exit = await readExit(directory);
    expectTypedNodeCause(
      exit,
      nodeMessage(() => readFileSync(directory, "utf8")),
    );
  });

  it("fails a directory write as a typed platform error carrying the Node message", async () => {
    const directory = mkdtempSync(join(tmpdir(), "acq-fs-"));
    directories.push(directory);
    const exit = await Effect.runPromise(
      Effect.provide(
        Effect.exit(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.writeFileString(directory, "nope");
          }),
        ),
        NodeFileSystemLive,
      ),
    );
    expectTypedNodeCause(
      exit,
      nodeMessage(() => writeFileSync(directory, "nope")),
    );
  });
});

function readExit(path: string) {
  return Effect.runPromise(
    Effect.provide(
      Effect.exit(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(path);
        }),
      ),
      NodeFileSystemLive,
    ),
  );
}

function expectTypedNodeCause(exit: Exit.Exit<unknown, unknown>, message: string): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  expect(Cause.hasDies(exit.cause)).toBe(false);
  const error = Cause.squash(exit.cause);
  expect(PlatformError.isPlatformError(error)).toBe(true);
  if (!PlatformError.isPlatformError(error)) return;
  expect(error.reason.cause).toBeInstanceOf(Error);
  expect((error.reason.cause as Error).message).toBe(message);
}

function nodeMessage(readOrWrite: () => void): string {
  try {
    readOrWrite();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the Node filesystem call to fail");
}
