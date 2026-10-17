import { Effect } from "effect";
import { HttpClient } from "effect/http";

import { parseFeedXml } from "../../domain/item/adapters/rss.js";
import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import type { FeedSubscription } from "../../domain/source/subscription.js";
import { asError, provideHttp, rssHeaders, timeoutFetch } from "./http.js";

export type RssClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class RssClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RssClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async getFeedEvents(feed: FeedSubscription): Promise<ActivityCardDto[]> {
    return Effect.runPromise(this.read(feed));
  }

  private read(feed: FeedSubscription): Effect.Effect<ActivityCardDto[], Error> {
    const timeoutMs = this.timeoutMs;
    const fetchImpl = timeoutFetch(this.fetchImpl, timeoutMs);
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
}
