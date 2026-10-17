import { Effect } from "effect";

import { errorMessage } from "../../../kernel/text.js";
import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import {
  isWebPageSource,
  type FeedSubscription,
  type IndustrySource,
} from "../../domain/source/subscription.js";
import { RssFeed, WebPage } from "../ports.js";

/** Same field order as RunSourceResult. `error` is omitted when the fetch succeeds. */
export type SourceHealth = {
  id: string;
  kind: "rss" | "web-page";
  name: string;
  url: string;
  status: "ok" | "failed";
  itemCount: number;
  error?: string;
};

export type SourceCollection = {
  events: ActivityCardDto[];
  sources: SourceHealth[];
};

type Collected = {
  events: ActivityCardDto[];
  source: SourceHealth;
};

export const collectRssFeeds = (
  feeds: readonly FeedSubscription[],
): Effect.Effect<SourceCollection, never, RssFeed> =>
  Effect.gen(function* () {
    const rss = yield* RssFeed;
    const results = yield* Effect.forEach(
      feeds,
      (feed) =>
        Effect.result(
          Effect.gen(function* () {
            const events = yield* rss.getFeedEvents(feed);
            return collected(feed, "rss", events);
          }),
        ),
      { concurrency: "unbounded" },
    );
    return combine(results.map((result, index) => settle(result, feeds[index]!, "rss")));
  });

export const collectIndustrySources = (
  sources: readonly IndustrySource[],
): Effect.Effect<SourceCollection, never, RssFeed | WebPage> =>
  Effect.gen(function* () {
    const rss = yield* RssFeed;
    const page = yield* WebPage;
    const results = yield* Effect.forEach(
      sources,
      (source) => {
        const kind: SourceHealth["kind"] = isWebPageSource(source) ? "web-page" : "rss";
        const fetched = isWebPageSource(source)
          ? page.getEvents(source)
          : rss.getFeedEvents(source);
        return Effect.result(
          Effect.gen(function* () {
            const events = yield* fetched;
            return collected(source, kind, events);
          }),
        );
      },
      { concurrency: "unbounded" },
    );
    return combine(
      results.map((result, index) => {
        const source = sources[index]!;
        const kind: SourceHealth["kind"] = isWebPageSource(source) ? "web-page" : "rss";
        return settle(result, source, kind);
      }),
    );
  });

function collected(
  source: { name: string; url: string },
  kind: SourceHealth["kind"],
  events: ActivityCardDto[],
): Collected {
  return {
    events,
    source: {
      id: source.url,
      kind,
      name: source.name,
      url: source.url,
      status: "ok",
      itemCount: events.length,
    },
  };
}

function settle(
  result: { _tag: "Success"; success: Collected } | { _tag: "Failure"; failure: unknown },
  source: { name: string; url: string },
  kind: SourceHealth["kind"],
): Collected {
  if (result._tag === "Success") return result.success;
  return {
    events: [],
    source: {
      id: source.url,
      kind,
      name: source.name,
      url: source.url,
      status: "failed",
      itemCount: 0,
      error: errorMessage(result.failure),
    },
  };
}

function combine(results: Collected[]): SourceCollection {
  return {
    events: results.flatMap((result) => result.events),
    sources: results.map((result) => result.source),
  };
}
