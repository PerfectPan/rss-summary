import { Schema } from "effect";

import type { CacheRequest } from "../index.js";
import type { SearchInput } from "../../search/index.js";

const daySchema = Schema.String.check(Schema.makeFilter(isCalendarDay));
const instantSchema = Schema.String.check(
  Schema.makeFilter(
    (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)),
  ),
);

export const requestSchema = Schema.Struct({
  provider: Schema.String,
  query: Schema.String.check(
    Schema.makeFilter((value: string) => value.trim() !== "" && value.length <= 100),
  ),
  count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
  day: daySchema,
  sinceDay: daySchema,
  sourcePolicy: Schema.Literals(["news", "authoritative", "official"]),
  window: Schema.optional(Schema.Struct({ since: instantSchema, until: instantSchema })),
});

export function parseCacheRequest(input: SearchInput, provider: string): CacheRequest {
  const request = Schema.decodeUnknownSync(requestSchema)({
    ...input,
    provider,
    sinceDay: input.sinceDay ?? input.day,
  });
  if (request.sinceDay > request.day) throw new Error("Invalid search start date.");
  if (request.window && Date.parse(request.window.since) >= Date.parse(request.window.until)) {
    throw new Error("Invalid search time window.");
  }
  return request;
}

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
