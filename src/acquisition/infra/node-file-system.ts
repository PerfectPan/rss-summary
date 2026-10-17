import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { Effect, FileSystem } from "effect";

export const NodeFileSystemLive = FileSystem.layerNoop({
  exists: (path) => Effect.sync(() => existsSync(path)),
  readFileString: (path) => Effect.sync(() => readFileSync(path, "utf8")),
  writeFileString: (path, data) =>
    Effect.sync(() => {
      writeFileSync(path, data);
    }),
  makeDirectory: (path, options) =>
    Effect.sync(() => {
      mkdirSync(path, { recursive: options?.recursive ?? false });
    }),
});
