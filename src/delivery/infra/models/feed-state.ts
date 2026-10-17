import { Schema } from "effect";

import { createEmptyFeedState, type FeedState } from "../../domain/ledger/index.js";

const researchRecordSchema = Schema.Struct({
  at: Schema.String,
  decision: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
});

const feedStateSchema = Schema.Struct({
  seen: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  researched: Schema.optional(Schema.Record(Schema.String, researchRecordSchema)),
});

/**
 * Decode raw parsed JSON into a `FeedState`. Missing `seen` / `researched`
 * sections default to empty objects; structurally invalid states are rejected.
 */
export function decodeFeedState(raw: unknown): FeedState {
  if (!isRecord(raw)) return createEmptyFeedState();
  const parsed = Schema.decodeUnknownSync(feedStateSchema)(raw);
  return {
    seen: parsed.seen ?? {},
    researched: parsed.researched ?? {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
