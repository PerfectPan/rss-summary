import type { NewsSourcePolicy } from "../domain/news.js";
import { asRecord, number, text } from "./parsing.js";

export type DoubaoSearchInput = {
  query: string;
  count: number;
  day: string;
  sourcePolicy: NewsSourcePolicy;
};

export type DoubaoSearchResult = {
  id: string;
  title: string;
  siteName?: string;
  url: string;
  snippet?: string;
  summary?: string;
  publishTime?: string;
  rankScore?: number;
  authInfoDescription?: string;
  authInfoLevel?: number;
};

export type DoubaoSearchPage = {
  logId?: string;
  resultCount: number;
  timeCostMs?: number;
  results: DoubaoSearchResult[];
};

type DoubaoSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class DoubaoSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DoubaoSearchClientOptions) {
    if (options.apiKey.trim() === "") throw new Error("DOUBAO_SEARCH_API_KEY is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://open.feedcoopapi.com/search_api/web_search";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async search(input: DoubaoSearchInput): Promise<DoubaoSearchPage> {
    validateInput(input);
    const filter: Record<string, unknown> = { NeedUrl: true };
    if (input.sourcePolicy === "official") filter.AuthInfoLevel = 1;

    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Query: input.query,
        SearchType: "web",
        Count: input.count,
        Filter: filter,
        TimeRange: `${input.day}..${input.day}`,
        QueryControl: { QueryRewrite: true },
        ContentFormats: "markdown",
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Doubao search HTTP ${response.status}`);

    return parseResponse(await response.json());
  }
}

function validateInput(input: DoubaoSearchInput): void {
  if (input.query.trim() === "" || input.query.length > 100) {
    throw new Error("Doubao search query must contain 1 to 100 characters.");
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
    throw new Error("Doubao web search count must be between 1 and 50.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.day)) throw new Error("Doubao search day must use YYYY-MM-DD.");
}

function parseResponse(value: unknown): DoubaoSearchPage {
  const root = asRecord(value);
  const metadata = asRecord(root.ResponseMetadata);
  const error = asRecord(metadata.Error);
  if (Object.keys(error).length > 0) {
    const code = text(error.Code) ?? text(error.CodeN) ?? "unknown";
    const message = text(error.Message) ?? "unknown error";
    throw new Error(`Doubao search API error ${code}: ${message}`);
  }

  const result = asRecord(root.Result);
  const results = Array.isArray(result.WebResults)
    ? result.WebResults.map(parseResult).filter((item): item is DoubaoSearchResult => item !== undefined)
    : [];
  return {
    logId: text(result.LogId),
    resultCount: number(result.ResultCount) ?? results.length,
    timeCostMs: number(result.TimeCost),
    results,
  };
}

function parseResult(value: unknown): DoubaoSearchResult | undefined {
  const item = asRecord(value);
  const id = text(item.Id);
  const title = text(item.Title);
  const url = text(item.Url);
  if (!id || !title || !url) return undefined;
  return {
    id,
    title,
    url,
    siteName: text(item.SiteName),
    snippet: text(item.Snippet),
    summary: text(item.Summary),
    publishTime: text(item.PublishTime),
    rankScore: number(item.RankScore),
    authInfoDescription: text(item.AuthInfoDes),
    authInfoLevel: number(item.AuthInfoLevel),
  };
}

