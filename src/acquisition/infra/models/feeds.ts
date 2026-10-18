import { Schema } from "effect";

import { parseFeedSubscriptions } from "../../domain/source/adapters/catalog.js";
import type { FeedSubscription } from "../../domain/source/index.js";

/** Document shape of feeds.json. Extra properties stay ignored, matching the hand parser. */
export const feedRecordSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  type: Schema.optional(Schema.String),
});

export const feedsFileSchema = Schema.Array(Schema.Union([Schema.String, feedRecordSchema]));

/**
 * Hand parser owns the error text. The schema documents the file and is applied
 * only after that parser accepts the document, so a schema mismatch cannot
 * replace SyntaxError or the historical messages.
 */
export function decodeFeedsJson(value: string): FeedSubscription[] {
  const feeds = parseFeedSubscriptions(value);
  const decoded = Schema.decodeUnknownResult(feedsFileSchema)(JSON.parse(value));
  if (decoded._tag === "Failure") return feeds;
  return feeds;
}
