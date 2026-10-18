import { NewsSearchError, type SearchPage, type SearchResult } from "../../acquisition/index.js";
import type { Item } from "../../acquisition/index.js";

import { itemFromDoubao } from "./mapper.js";

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
