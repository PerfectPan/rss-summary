import type { ActivityCard } from "../domain/digest.js";
import type { RunSourceResult } from "../domain/run-audit.js";
import type { FeedSubscription } from "./config.js";
import { errorMessage } from "./parsing.js";
import type { RssClient } from "./rss.js";

export type RssCollection = {
  events: ActivityCard[];
  sources: RunSourceResult[];
};

/** Fetch feeds independently so one broken subscription remains visible but non-blocking. */
export async function collectRssFeeds(
  client: Pick<RssClient, "getFeedEvents">,
  feeds: FeedSubscription[],
): Promise<RssCollection> {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const events = await client.getFeedEvents(feed);
        return {
          events,
          source: {
            id: feed.url,
            kind: "rss" as const,
            name: feed.name,
            url: feed.url,
            status: "ok" as const,
            itemCount: events.length,
          },
        };
      } catch (error) {
        return {
          events: [],
          source: {
            id: feed.url,
            kind: "rss" as const,
            name: feed.name,
            url: feed.url,
            status: "failed" as const,
            itemCount: 0,
            error: errorMessage(error),
          },
        };
      }
    }),
  );

  return {
    events: results.flatMap((result) => result.events),
    sources: results.map((result) => result.source),
  };
}
