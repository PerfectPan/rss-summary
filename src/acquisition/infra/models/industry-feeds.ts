import { Schema } from "effect";

import { parseIndustrySources } from "../../domain/source/services/catalog.js";
import type { IndustrySource } from "../../domain/source/index.js";
import { feedRecordSchema } from "./feeds.js";

const pageRecordSchema = Schema.Struct({
  type: Schema.Literal("page"),
  name: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  pathPrefixes: Schema.optional(Schema.Array(Schema.String)),
  tags: Schema.optional(Schema.Array(Schema.String)),
});

export const industryFeedsFileSchema = Schema.Array(
  Schema.Union([Schema.String, feedRecordSchema, pageRecordSchema]),
);

/** Same split as decodeFeedsJson: parser messages stay authoritative. */
export function decodeIndustryJson(value: string): IndustrySource[] {
  const sources = parseIndustrySources(value);
  const decoded = Schema.decodeUnknownResult(industryFeedsFileSchema)(JSON.parse(value));
  if (decoded._tag === "Failure") return sources;
  return sources;
}
