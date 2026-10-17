import { NewsSearchError, type SearchPage, type SearchResult } from "../../search/search.js";
import type { CredibilityTier, Item } from "../item.js";

export class DoubaoSearchError extends NewsSearchError {
  constructor(code: string, message: string, options: { retryAfterMs?: number } = {}) {
    super(code, `Doubao search API error ${code}: ${message}`, options);
    this.name = "DoubaoSearchError";
  }
}

export type DoubaoAcquired = {
  page: SearchPage;
  items: Item[];
};

type SearchInput = {
  query: string;
  count: number;
  day: string;
  sinceDay?: string;
  sourcePolicy: string;
};

export function validateDoubaoInput(input: SearchInput): void {
  if (input.query.trim() === "" || input.query.length > 100) {
    throw new Error("Doubao search query must contain 1 to 100 characters.");
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
    throw new Error("Doubao web search count must be between 1 and 50.");
  }
  if (
    input.sinceDay &&
    (!/^\d{4}-\d{2}-\d{2}$/u.test(input.sinceDay) || input.sinceDay > input.day)
  ) {
    throw new Error("Invalid search start date.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.day)) {
    throw new Error("Doubao search day must use YYYY-MM-DD.");
  }
}

export function parseDoubaoResponse(value: unknown, retryAfterMs?: number): DoubaoAcquired {
  const root = asRecord(value);
  const metadata = asRecord(root.ResponseMetadata);
  const error = asRecord(metadata.Error);
  if (Object.keys(error).length > 0) {
    const code = text(error.Code) ?? text(error.CodeN) ?? "unknown";
    const message = text(error.Message) ?? "unknown error";
    throw new DoubaoSearchError(code, message, { retryAfterMs });
  }

  const result = asRecord(root.Result);
  const parsed = Array.isArray(result.WebResults)
    ? result.WebResults.flatMap((item, index) => {
        const acquired = parseDoubaoResult(item, index + 1);
        return acquired ? [acquired] : [];
      })
    : [];
  return {
    page: {
      logId: text(result.LogId),
      resultCount: number(result.ResultCount) ?? parsed.length,
      timeCostMs: number(result.TimeCost),
      results: parsed.map(({ result: hit }) => hit),
    },
    items: parsed.map(({ item }) => item),
  };
}

export function parseDoubaoResult(
  value: unknown,
  fallbackRankPosition: number,
): { result: SearchResult; item: Item } | undefined {
  const record = asRecord(value);
  const id = text(record.Id);
  const title = text(record.Title);
  const url = text(record.Url);
  if (!id || !title || !url) return undefined;
  const sortId = number(record.SortId);
  const rankPosition =
    sortId !== undefined && Number.isInteger(sortId) && sortId > 0 ? sortId : fallbackRankPosition;
  const result: SearchResult = {
    id,
    title,
    url,
    siteName: text(record.SiteName),
    snippet: text(record.Snippet),
    summary: text(record.Summary),
    publishTime: text(record.PublishTime),
    rankScore: number(record.RankScore),
    rankPosition,
    authInfoDescription: text(record.AuthInfoDes),
    authInfoLevel: number(record.AuthInfoLevel),
  };
  return { result, item: itemFromDoubao(result) };
}

/**
 * Authority levels follow the news score table: 1 is an official source,
 * 2 is authoritative, and every other level stays unrated.
 */
export function credibilityForAuthLevel(level: number | undefined): { tier: CredibilityTier } {
  if (level === 1) return { tier: "official" };
  if (level === 2) return { tier: "authoritative" };
  return { tier: "unrated" };
}

function itemFromDoubao(result: SearchResult): Item {
  const published = result.publishTime;
  return {
    id: result.id,
    kind: "publication",
    subject: {
      key: result.url,
      name: result.siteName ?? result.url,
      url: result.url,
    },
    content: {
      title: result.title,
      ...(result.summary || result.snippet ? { excerpt: result.summary ?? result.snippet } : {}),
      url: result.url,
    },
    publishedAt: {
      value: published ?? "",
      precision: published && published.includes("T") ? "instant" : "date",
    },
    provenance: {
      origin: result.url,
      ...(result.authInfoDescription ? { note: result.authInfoDescription } : {}),
    },
    credibility: credibilityForAuthLevel(result.authInfoLevel),
    signals: [],
    rank: {
      position: result.rankPosition,
      ...(result.rankScore !== undefined ? { score: result.rankScore } : {}),
    },
    display: {
      ...(result.siteName ? { label: result.siteName } : {}),
      reference: result.url,
      facts: [],
    },
  };
}

const objectCtorString = Function.prototype.toString.call(Object);

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto: object | null = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return (
    typeof ctor === "function" &&
    ctor instanceof ctor &&
    Function.prototype.toString.call(ctor) === objectCtorString
  );
}

function text(value: unknown): string | undefined {
  if (
    typeof value === "string" ||
    (isObjectLike(value) &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === "[object String]")
  ) {
    const normalized = value.toString().trim();
    return normalized === "" ? undefined : normalized;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? "-0" : String(value);
  }
  return undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object";
}
