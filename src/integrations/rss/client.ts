import { Effect } from "effect";
import { HttpClient } from "effect/http";

import type { ActivityCardDto, FeedSubscription } from "../../acquisition/index.js";

import { parseFeedXml } from "./mapper.js";
import { asError, provideHttp, timeoutFetch } from "../shared/http.js";

export const rssHeaders = {
  accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  "user-agent": "rss-summary/0.1",
} as const;

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
