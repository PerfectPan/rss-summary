import { dirname } from "node:path";

import { Effect, FileSystem, Layer } from "effect";

import { formatFeedSubscriptions } from "../../domain/source/adapters/catalog.js";
import type { FeedSubscription } from "../../domain/source/subscription.js";
import { SourceCatalogStore } from "../../application/ports.js";
import { decodeFeedsJson } from "../models/feeds.js";
import { asError } from "../adapters/http.js";

export const SourceCatalogFileLive = Layer.effect(
  SourceCatalogStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const loadFeeds = (path: string): Effect.Effect<FeedSubscription[], Error> =>
      Effect.gen(function* () {
        const exists = yield* fs.exists(path);
        if (!exists) return [];
        return decodeFeedsJson(yield* fs.readFileString(path));
      }).pipe(Effect.mapError(asError));
    const saveFeeds = (
      path: string,
      feeds: readonly FeedSubscription[],
    ): Effect.Effect<void, Error> =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          yield* fs.makeDirectory(dirname(path), { recursive: true });
          yield* fs.writeFileString(path, formatFeedSubscriptions(feeds));
        }),
      ).pipe(Effect.mapError(asError));
    return { loadFeeds, saveFeeds };
  }),
);
