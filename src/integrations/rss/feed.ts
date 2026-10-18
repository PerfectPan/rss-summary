import { Effect, Layer } from "effect";

import { RssFeed } from "../../acquisition/index.js";

import { acquireActivityCard } from "../shared/scoring-trace.js";
import { readFeedEvents, type RssFeedOptions } from "./client.js";

export const RssFeedLive = (options: RssFeedOptions = {}): Layer.Layer<RssFeed> =>
  Layer.succeed(RssFeed, {
    getFeedEvents: (feed) =>
      Effect.map(readFeedEvents(feed, options), (cards) => cards.map(acquireActivityCard)),
  });
