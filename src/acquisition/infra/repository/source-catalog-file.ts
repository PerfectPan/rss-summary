import { dirname } from "node:path";

import { Effect, FileSystem, Layer, PlatformError } from "effect";

import { formatFeedSubscriptions } from "../../domain/source/services/catalog.js";
import type { FeedSubscription } from "../../domain/source/index.js";
import { SourceCatalogStore } from "../../application/ports.js";
import { decodeFeedsJson } from "../models/feeds.js";

export const SourceCatalogFileLive = Layer.effect(
  SourceCatalogStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const loadFeeds = (path: string): Effect.Effect<FeedSubscription[], Error> =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(path);
        if (!exists) return [];
        return decodeFeedsJson(yield* fs.readFileString(path));
      }).pipe(Effect.mapError(asFileError));
    const saveFeeds = (
      path: string,
      feeds: readonly FeedSubscription[],
    ): Effect.Effect<void, Error> =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          yield* fs.makeDirectory(dirname(path), { recursive: true });
          yield* fs.writeFileString(path, formatFeedSubscriptions(feeds));
        }),
      ).pipe(Effect.mapError(asFileError));
    return { loadFeeds, saveFeeds };
  }),
);

/** The feeds CLI prints `error.message`. Keep Node's own message for that text. */
function asFileError(error: unknown): Error {
  if (PlatformError.isPlatformError(error) && error.reason.cause instanceof Error) {
    return error.reason.cause;
  }
  return error instanceof Error ? error : new Error(String(error));
}
