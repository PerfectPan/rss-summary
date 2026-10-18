import { Effect } from "effect";

import { addFeedSubscription, removeFeedSubscription } from "../../domain/source/index.js";
import type { FeedSubscription, FeedSubscriptionInput } from "../../domain/source/index.js";
import { SourceCatalogStore } from "../ports.js";

export const listCatalogFeeds = (
  path: string,
): Effect.Effect<FeedSubscription[], Error, SourceCatalogStore> =>
  Effect.gen(function* () {
    const store = yield* SourceCatalogStore;
    return yield* store.loadFeeds(path);
  });

export const addCatalogFeed = (
  path: string,
  input: FeedSubscriptionInput,
): Effect.Effect<FeedSubscription[], Error, SourceCatalogStore> =>
  Effect.gen(function* () {
    const store = yield* SourceCatalogStore;
    const feeds = yield* store.loadFeeds(path);
    const next = yield* Effect.try({
      try: () => addFeedSubscription(feeds, input),
      catch: asError,
    });
    yield* store.saveFeeds(path, next);
    return next;
  });

export const removeCatalogFeed = (
  path: string,
  url: string,
): Effect.Effect<FeedSubscription[], Error, SourceCatalogStore> =>
  Effect.gen(function* () {
    const store = yield* SourceCatalogStore;
    const feeds = yield* store.loadFeeds(path);
    const next = yield* Effect.try({
      try: () => removeFeedSubscription(feeds, url),
      catch: asError,
    });
    yield* store.saveFeeds(path, next);
    return next;
  });

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
