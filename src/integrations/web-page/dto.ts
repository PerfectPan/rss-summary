import { Schema } from "effect";
import { load } from "cheerio";

import type { WebPageSubscription } from "../../acquisition/index.js";

import { decodeSchema } from "../shared/decode.js";

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

export const entrySchema = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  publishedAt: Schema.String,
  summary: Schema.optional(Schema.String),
});

/** A raw extracted entry before decoding; invalid shapes decode to nothing upstream. */
export function decodeEntry(entry: WebPageEntry): WebPageEntry | undefined {
  const decoded = decodeSchema(entrySchema, entry);
  return decoded._tag === "Ok" ? decoded.value : undefined;
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
    const structuredTitle =
      cleanTitle(titleElement.text()) ?? cleanTitle(element.find("article p").first().text());
    const textTitle = cleanTitle(element.clone().find("time").remove().end().text());
    const [title, titleScore] = ariaTitle
      ? [ariaTitle, 3]
      : structuredTitle
        ? [structuredTitle, 2]
        : textTitle
          ? [textTitle, 1]
          : [undefined, 0];
    const article = element.closest("article");
    // A changelog's date/title links and body can be siblings. Only borrow a body
    // when that article identifies one entry, so neighboring updates cannot leak in.
    const articleUrls = new Set(
      article
        .find("a[href]")
        .toArray()
        .map((link) => canonicalUrl($(link).attr("href"), source.url))
        .filter(
          (link) => link && isSameHost(link, source.url) && matchesPath(link, source.pathPrefixes),
        ),
    );
    const paragraphs = articleUrls.size === 1 ? article.find("p") : element.find("p");
    const summary = cleanText(
      paragraphs
        .toArray()
        .filter((paragraph) => $(paragraph).find("time").length === 0)
        .map((paragraph) => cleanText($(paragraph).text()))
        .filter((text) => text && text !== title)
        .join(" "),
    )?.slice(0, 4000);

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

function matchesPath(url: string, prefixes: string[]): boolean {
  const path = new URL(url).pathname;
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function isSameHost(value: string, sourceUrl: string): boolean {
  return new URL(value).hostname === new URL(sourceUrl).hostname;
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
