import { Schema } from "effect";
import { load } from "cheerio";

import { decodeSchema } from "../../shared/decode.js";

export type HomeFeedLinkSnapshot = {
  text: string;
  href: string;
};

export type HomeFeedCardSnapshot = {
  id: string;
  card: Record<string, unknown> | null;
  text: string;
  links: HomeFeedLinkSnapshot[];
};

const githubHomeUrl = "https://github.com/";

const linkSchema = Schema.Struct({
  text: Schema.optional(Schema.Unknown),
  href: Schema.optional(Schema.Unknown),
});

const snapshotSchema = Schema.Struct({
  id: Schema.optional(Schema.Unknown),
  card: Schema.optional(Schema.NullOr(Schema.Unknown)),
  text: Schema.optional(Schema.Unknown),
  links: Schema.optional(Schema.Array(linkSchema)),
});

/** A decoded snapshot, soft-casting anything the schema rejects. */
export function homeSnapshot(input: unknown): HomeFeedCardSnapshot {
  const decoded = decodeSchema(snapshotSchema, input);
  const raw = decoded._tag === "Ok" ? decoded.value : asRecord(input);
  const links = Array.isArray(raw.links) ? raw.links : [];
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    card: asRecordOrNull(raw.card),
    text: typeof raw.text === "string" ? raw.text : "",
    links: links.map((link) => {
      const record = asRecord(link);
      return {
        text: typeof record.text === "string" ? record.text : "",
        href: typeof record.href === "string" ? record.href : "",
      };
    }),
  };
}

export function extractHomeFeedSnapshotsFromHtml(html: string): HomeFeedCardSnapshot[] {
  const $ = load(html);
  return $("#conduit-feed-frame article.js-feed-item-component, article.js-feed-item-component")
    .toArray()
    .map((article) => {
      const element = $(article);
      const links = element
        .find("a[href]")
        .toArray()
        .map((link) => ({
          text: cleanText($(link).text()),
          href: absoluteGithubHref($(link).attr("href") ?? ""),
        }));

      return homeSnapshot({
        id: element.attr("id") ?? "",
        card: parseHydroFeedCard(element.attr("data-hydro-view")),
        text: cleanText(element.text()),
        links,
      });
    });
}

export function hasGitHubHomeFeedMarkup(html: string): boolean {
  const $ = load(html);
  return $("feed-container").length > 0 && $("#conduit-feed-frame").length > 0;
}

/** Resolve a scraped href against the Home origin; unparseable hrefs pass through. */
export function absoluteGithubHref(href: string): string {
  try {
    return new URL(href, githubHomeUrl).href;
  } catch {
    return href;
  }
}

function parseHydroFeedCard(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { payload?: { feed_card?: unknown } };
    return asRecordOrNull(parsed.payload?.feed_card);
  } catch {
    return null;
  }
}

function cleanText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

const objectCtorString = Function.prototype.toString.call(Object);

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
