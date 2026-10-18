import type { ReadRequest, ReadResult } from "../../domain/document/index.js";
import { validateArticleResearchUrl } from "../../domain/document/index.js";

export type ArticleExtract = (
  body: string,
  url: string,
  maxChars?: number,
) => { content: string; title: string };

export type ArticleResearchRequest = ReadRequest;

export type ArticleResearchResult = ReadResult;

export type ArticleResearchClientOptions = {
  extract: ArticleExtract;
  fetch?: typeof fetch;
  maxBytes?: number;
  maxChars?: number;
  now?: () => Date;
  timeoutMs?: number;
};

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_MAX_CHARS = 16_000;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Fetch and extract the readable body of one article selected by the Agent. */
export class ArticleResearchClient {
  private readonly extract: ArticleExtract;
  private readonly fetchImpl: typeof fetch;
  private readonly maxBytes: number;
  private readonly maxChars: number;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: ArticleResearchClientOptions) {
    this.extract = options.extract;
    this.fetchImpl = options.fetch ?? fetch;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async research(request: ArticleResearchRequest): Promise<ArticleResearchResult> {
    const retrievedAt = this.now().toISOString();
    try {
      const url = validateArticleResearchUrl(request.url);
      const response = await this.fetchImpl(url, {
        headers: {
          accept: "text/html, application/xhtml+xml, text/plain;q=0.8, */*;q=0.5",
          "user-agent": "rss-summary/0.1 article-research",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`article returned HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !/(?:html|xhtml|text|xml)/u.test(contentType)) {
        throw new Error(`unsupported article content type: ${contentType}`);
      }
      const body = await readResponseBody(response, this.maxBytes);
      const extracted = this.extract(body, response.url || url, this.maxChars);
      if (extracted.content.length < 80)
        throw new Error("article body was too short after extraction");
      return {
        content: extracted.content,
        fetchedUrl: response.url || url,
        method: "http",
        ref: request.ref,
        retrievedAt,
        status: "ok",
        title: extracted.title,
        url,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        method: "http",
        ref: request.ref,
        retrievedAt,
        status: "failed",
        url: request.url,
      };
    }
  }
}

async function readResponseBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`article response exceeded ${maxBytes} bytes`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`article response exceeded ${maxBytes} bytes`);
  return new TextDecoder().decode(bytes);
}
