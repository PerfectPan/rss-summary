import { Effect, Layer } from "effect";
import { HttpClient } from "effect/http";

import { parseFeedXml } from "../../domain/item/adapters/rss.js";
import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import { acquireActivityCard } from "../../domain/item/adapters/scoring-trace.js";
import type { FeedSubscription } from "../../domain/source/index.js";
import { RssFeed } from "../../application/ports.js";
import { asError, provideHttp, rssHeaders, timeoutFetch } from "./http.js";

export type RssFeedOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** Fetch one configured feed and parse it into activity cards. */
export function readFeedEvents(
  feed: FeedSubscription,
  options: RssFeedOptions = {},
): Effect.Effect<ActivityCardDto[], Error> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const fetchImpl = timeoutFetch(options.fetch ?? fetch, timeoutMs);
  return Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const response = yield* http
      .get(feed.url, { headers: rssHeaders })
      .pipe(Effect.mapError(asError));
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(new Error(`RSS feed ${feed.name} returned ${response.status}`));
    }
    const xml = yield* response.text.pipe(Effect.mapError(asError));
    return parseFeedXml(xml, feed, new Date());
  }).pipe((effect) => provideHttp(effect, fetchImpl));
}

export const RssFeedLive = (options: RssFeedOptions = {}): Layer.Layer<RssFeed> =>
  Layer.succeed(RssFeed, {
    getFeedEvents: (feed) =>
      Effect.map(readFeedEvents(feed, options), (cards) => cards.map(acquireActivityCard)),
  });
