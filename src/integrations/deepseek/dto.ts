import { Schema } from "effect";

import { canonicalizeUrl } from "../../kernel/text.js";
import {
  NewsSearchError,
  type Item,
  type SearchPage,
  type SearchResult,
} from "../../acquisition/index.js";

import { deepSeekPublicationDay, itemFromDeepSeek } from "./mapper.js";

export class DeepSeekSearchError extends NewsSearchError {
  constructor(code: string, message: string, options: { retryAfterMs?: number } = {}) {
    super(code, `DeepSeek search API error ${code}: ${message}`, options);
    this.name = "DeepSeekSearchError";
  }
}

export type DeepSeekAcquired = {
  page: SearchPage;
  items: Item[];
};

/**
 * Top level of `POST /v1/tools/search`: an object whose `results` array holds
 * one record per hit. Items decode one by one so a single malformed record
 * drops that record instead of the whole page.
 */
const responseSchema = Schema.Struct({
  results: Schema.Array(Schema.Unknown),
});

const resultSchema = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1)),
  url: Schema.String.check(Schema.isMinLength(1)),
  snippet: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.String),
  site_name: Schema.optional(Schema.NullOr(Schema.String)),
  date: Schema.optional(Schema.NullOr(Schema.String)),
  authority: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 4 }))),
  rerank_score: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 3 }))),
});

export function parseDeepSeekResponse(value: unknown, retryAfterMs?: number): DeepSeekAcquired {
  let response: { results: readonly unknown[] };
  try {
    response = Schema.decodeUnknownSync(responseSchema)(value);
  } catch (cause) {
    throw new DeepSeekSearchError("invalid_response", causeText(cause), { retryAfterMs });
  }
  const parsed = response.results.flatMap((record, index) => {
    try {
      const hit = Schema.decodeUnknownSync(resultSchema)(record);
      const result = deepSeekResult(hit, index + 1);
      return [{ result, item: itemFromDeepSeek(result) }];
    } catch {
      return [];
    }
  });
  return {
    page: {
      provider: "deepseek",
      resultCount: parsed.length,
      results: parsed.map(({ result }) => result),
    },
    items: parsed.map(({ item }) => item),
  };
}

function deepSeekResult(hit: typeof resultSchema.Type, rankPosition: number): SearchResult {
  const url = hit.url;
  const canonical = canonicalizeUrl(url) ?? url;
  const siteName = hit.site_name ?? undefined;
  const publishDay = hit.date ? deepSeekPublicationDay(hit.date) : undefined;
  return {
    id: `deepseek:${canonical}`,
    title: hit.title,
    url,
    ...(siteName !== undefined ? { siteName } : {}),
    ...(hit.snippet !== undefined ? { snippet: hit.snippet } : {}),
    ...(hit.summary !== undefined ? { summary: hit.summary } : {}),
    ...(hit.date ? { publishTime: publishDay ? publishDay.day : hit.date } : {}),
    ...(publishDay !== undefined ? { publishDay } : {}),
    ...(hit.rerank_score !== undefined ? { rankScore: hit.rerank_score } : {}),
    ...(hit.authority !== undefined ? { authority: hit.authority } : {}),
    rankPosition,
  };
}

function causeText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
