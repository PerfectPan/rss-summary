import { load } from "cheerio";

export type ArticleResearchRequest = {
  ref: string;
  url: string;
};

export type ArticleResearchResult =
  | {
      content: string;
      fetchedUrl: string;
      ref: string;
      retrievedAt: string;
      status: "ok";
      title: string;
      url: string;
    }
  | {
      error: string;
      ref: string;
      retrievedAt: string;
      status: "failed";
      url: string;
    };

export type ArticleResearchClientOptions = {
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
  private readonly fetchImpl: typeof fetch;
  private readonly maxBytes: number;
  private readonly maxChars: number;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: ArticleResearchClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async research(request: ArticleResearchRequest): Promise<ArticleResearchResult> {
    const retrievedAt = this.now().toISOString();
    try {
      const url = validateResearchUrl(request.url);
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
      const extracted = extractArticle(body, response.url || url, this.maxChars);
      if (extracted.content.length < 80)
        throw new Error("article body was too short after extraction");
      return {
        content: extracted.content,
        fetchedUrl: response.url || url,
        ref: request.ref,
        retrievedAt,
        status: "ok",
        title: extracted.title,
        url,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        ref: request.ref,
        retrievedAt,
        status: "failed",
        url: request.url,
      };
    }
  }
}

export function extractArticle(
  body: string,
  url: string,
  maxChars = DEFAULT_MAX_CHARS,
): { content: string; title: string } {
  const $ = load(body);
  const title = cleanText(
    $("meta[property='og:title']").attr("content") ||
      $("h1").first().text() ||
      $("title").first().text() ||
      new URL(url).hostname,
  );
  const root = selectContentRoot($);
  root
    .find(
      "script,style,noscript,template,svg,nav,footer,header,aside,form,button,iframe,video,audio",
    )
    .remove();
  const lines = root
    .find("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th")
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter((line): line is string => Boolean(line))
    .filter((line) => !isResearchBoilerplate(line));
  const structured = compactLines(lines).slice(0, maxChars).trim();
  const content = (structured || cleanText($.root().text())).slice(0, maxChars).trim();
  return { content, title };
}

function selectContentRoot($: ReturnType<typeof load>) {
  const candidates = $(
    "article,[itemprop='articleBody'],[data-pagefind-body],.markdown-body,.prose,main",
  );
  let best = candidates.first();
  let bestScore = Number.NEGATIVE_INFINITY;
  candidates.each((_index, element) => {
    const current = $(element);
    const textLength = current.text().replace(/\s+/gu, " ").trim().length;
    const headingCount = current.find("h1,h2,h3,h4,h5,h6").length;
    const paragraphCount = current.find("p").length;
    const listItemCount = current.find("li").length;
    const score = textLength + headingCount * 500 + paragraphCount * 100 - listItemCount * 30;
    if (score > bestScore) {
      best = current;
      bestScore = score;
    }
  });
  return best;
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

function validateResearchUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("article URL must use http or https");
  }
  if (url.username || url.password) throw new Error("article URL must not contain credentials");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("article URL points to a private or local host");
  }
  return url.toString();
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function isResearchBoilerplate(line: string): boolean {
  return (
    /^"?\s*AI资讯\s*\|\s*每日早读/u.test(line) ||
    line === "AI资讯日报多渠道" ||
    /^(?:💬\s*|📹\s*)?(?:微信公众号|抖音)$/u.test(line) ||
    /^(?:公众号|自媒体账号)[:：]?/u.test(line)
  );
}

function compactLines(lines: string[]): string {
  const seen = new Set<string>();
  return lines
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join("\n");
}
