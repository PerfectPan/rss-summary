import { load } from "cheerio";

import type { ActivityCard } from "../domain/digest.js";
import type { WebPageSubscription } from "./config.js";

type WebPageClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type WebPageEntry = {
  url: string;
  title: string;
  publishedAt: string;
  summary?: string;
};

type PendingEntry = {
  title?: string;
  titleScore: number;
  publishedAt?: string;
  summary?: string;
};

export class WebPageClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: WebPageClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getEvents(source: WebPageSubscription): Promise<ActivityCard[]> {
    const html = await this.fetchHtml(source.url);
    const entries = extractWebPageEntries(html, source);
    if (entries.length === 0) {
      throw new Error(`Web page ${source.name} returned no dated links matching its path prefixes`);
    }
    return entries.map((entry) => normalizeWebPageEntry(entry, source));
  }

  private async fetchHtml(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.8",
            "user-agent": "rss-summary/0.1",
          },
        });
        if (!response.ok) {
          const error = new Error(`Web page ${url} returned ${response.status}`);
          if (!isRetryableStatus(response.status) || attempt === this.maxAttempts) throw error;
          lastError = error;
        } else {
          return response.text();
        }
      } catch (error) {
        lastError = error;
        if (!isRetryableFetchError(error) || attempt === this.maxAttempts) throw error;
      }
      await this.sleep(250 * 2 ** (attempt - 1));
    }
    throw lastError instanceof Error ? lastError : new Error(`Web page ${url} failed`);
  }
}

export function extractWebPageEntries(html: string, source: WebPageSubscription): WebPageEntry[] {
  const $ = load(html);
  const entries = new Map<string, PendingEntry>();

  $("a[href]").each((_, anchor) => {
    const element = $(anchor);
    const url = canonicalUrl(element.attr("href"), source.url);
    if (!url || !isSameHost(url, source.url) || !matchesPath(url, source.pathPrefixes)) return;

    const current = entries.get(url) ?? { titleScore: 0 };
    const time = element.find("time").first();
    const publishedAt = normalizedDate(time.attr("datetime") ?? cleanText(time.text()));
    const titleElement = element
      .find("h1, h2, h3, h4, [role='heading'], [class*='title'], [class*='headline']")
      .first();
    const ariaTitle = cleanTitle(element.attr("aria-label"));
    const structuredTitle = cleanTitle(titleElement.text());
    const textTitle = cleanTitle(element.clone().find("time").remove().end().text());
    const [title, titleScore] = ariaTitle
      ? [ariaTitle, 3]
      : structuredTitle
        ? [structuredTitle, 2]
        : textTitle
          ? [textTitle, 1]
          : [undefined, 0];
    const summary = cleanText(element.find("p").first().text());

    entries.set(url, {
      title: titleScore > current.titleScore ? title : current.title,
      titleScore: Math.max(titleScore, current.titleScore),
      publishedAt: current.publishedAt ?? publishedAt,
      summary: betterSummary(current.summary, summary),
    });
  });

  return [...entries.entries()].flatMap(([url, entry]) =>
    entry.title && entry.publishedAt
      ? [
          {
            url,
            title: entry.title,
            publishedAt: entry.publishedAt,
            ...(entry.summary ? { summary: entry.summary } : {}),
          },
        ]
      : [],
  );
}

function normalizeWebPageEntry(entry: WebPageEntry, source: WebPageSubscription): ActivityCard {
  return {
    id: `web:${source.url}:${entry.url}`,
    type: publicationType(source.tags),
    source: "web",
    actor: source.name,
    repo: `web:${entry.url}`,
    createdAt: entry.publishedAt,
    action: "published",
    htmlUrl: entry.url,
    title: entry.title,
    summary: entry.summary,
    sourceName: source.name,
    sourceUrl: source.url,
    tags: source.tags,
  };
}

function matchesPath(url: string, prefixes: string[]): boolean {
  const path = new URL(url).pathname;
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function isSameHost(value: string, sourceUrl: string): boolean {
  return new URL(value).hostname === new URL(sourceUrl).hostname;
}

function publicationType(tags: string[]): "article" | "paper" | "release" {
  const normalized = new Set(tags.map((tag) => tag.toLowerCase()));
  if (normalized.has("papers") || normalized.has("academic")) return "paper";
  if (normalized.has("releases")) return "release";
  return "article";
}

function canonicalUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return undefined;
  }
}

function cleanTitle(value: string | undefined): string | undefined {
  const cleaned = cleanText(value);
  return cleaned && !normalizedDate(cleaned) ? cleaned : undefined;
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/gu, " ").trim();
  return cleaned || undefined;
}

function betterSummary(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.length > current.length ? candidate : current;
}

function normalizedDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}T12:00:00.000Z`;
  const englishDay =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/iu.exec(
      value.trim(),
    );
  if (englishDay) {
    const month = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(englishDay[1]!.toLowerCase());
    return new Date(
      Date.UTC(Number(englishDay[3]), month, Number(englishDay[2]), 12),
    ).toISOString();
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableFetchError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}
