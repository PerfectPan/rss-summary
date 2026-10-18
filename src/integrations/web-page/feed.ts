import { Effect, Layer } from "effect";

import { WebPage } from "../../acquisition/index.js";

import { acquireActivityCard } from "../shared/scoring-trace.js";
import { readWebPageEvents, type WebPageOptions } from "./client.js";

export const WebPageLive = (options: WebPageOptions = {}): Layer.Layer<WebPage> =>
  Layer.succeed(WebPage, {
    getEvents: (source) =>
      Effect.map(readWebPageEvents(source, options), (cards) => cards.map(acquireActivityCard)),
  });
