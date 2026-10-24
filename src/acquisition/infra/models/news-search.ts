import { Schema } from "effect";

const daySchema = Schema.String.check(Schema.makeFilter(isCalendarDay));
const countSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const instantSchema = Schema.String.check(
  Schema.makeFilter(
    (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)),
  ),
);

export const cacheRequestSchema = Schema.Struct({
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

/** Stored pages keep this field order. Optional fields that are absent stay absent. */
/**
 * Mirrors `rawPageSchema`'s provider literals: the persisted cache can only
 * represent pages from the providers the state format knows, so the budget
 * asks the format (not a service name of its own) which pages may be stored.
 */
export function pageRepresentable(page: { provider?: string }): boolean {
  return (
    page.provider === undefined ||
    page.provider === "doubao" ||
    page.provider === "grok" ||
    page.provider === "deepseek"
  );
}

export const rawPageSchema = Schema.Struct({
  provider: Schema.optional(Schema.Literals(["doubao", "grok", "deepseek"])),
  grok: Schema.optional(
    Schema.Struct({
      nativeTools: Schema.Array(Schema.String),
      nativeCallCount: Schema.optional(countSchema),
      elapsedMs: Schema.optional(countSchema),
      rejectedResults: countSchema,
      costUsd: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
      totalTokens: Schema.optional(countSchema),
      inputTokens: Schema.optional(countSchema),
      cachedInputTokens: Schema.optional(countSchema),
      outputTokens: Schema.optional(countSchema),
    }),
  ),
  logId: Schema.optional(Schema.String),
  resultCount: countSchema,
  timeCostMs: Schema.optional(Schema.Number),
  results: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      url: Schema.String,
      rankPosition: Schema.Number,
      siteName: Schema.optional(Schema.String),
      snippet: Schema.optional(Schema.String),
      summary: Schema.optional(Schema.String),
      publishTime: Schema.optional(Schema.String),
      publishDay: Schema.optional(Schema.Struct({ day: daySchema, timezoneOffset: Schema.String })),
      rankScore: Schema.optional(Schema.Number),
      authInfoDescription: Schema.optional(Schema.String),
      authInfoLevel: Schema.optional(Schema.Number),
      authority: Schema.optional(Schema.Number),
    }),
  ),
});

const cacheEntrySchema = Schema.Struct({
  request: cacheRequestSchema,
  fetchedAt: Schema.String.check(
    Schema.makeFilter((value: string) => {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
    }),
  ),
  page: rawPageSchema,
});

export const newsSearchStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  timezoneOffset: Schema.String,
  daily: Schema.Record(daySchema, countSchema),
  cache: Schema.Record(Schema.String, cacheEntrySchema),
});

export type NewsSearchStateFile = typeof newsSearchStateSchema.Type;

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
