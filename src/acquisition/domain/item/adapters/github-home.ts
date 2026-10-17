import { Schema } from "effect";
import { load } from "cheerio";

import { decodeSchema } from "./decode.js";
import { itemFromGitHubCard } from "./github-event.js";
import type { Acquired, ActivityCardDto, ActivityType } from "./activity-card.js";

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

export function acquireHomeCard(input: unknown): Acquired {
  const card = normalizeHomeCardSnapshot(homeSnapshot(input));
  return { card, item: itemFromGitHubCard(card) };
}

export function acquireHomeCards(inputs: readonly unknown[]): Acquired[] {
  return inputs.flatMap((input) => {
    const acquired = acquireHomeCard(input);
    return acquired.card.type === "other" ? [] : [acquired];
  });
}

export function normalizeHomeCardSnapshots(cards: HomeFeedCardSnapshot[]): ActivityCardDto[] {
  return cards.map(normalizeHomeCardSnapshot).filter((card) => card.type !== "other");
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

export function normalizeHomeCardSnapshot(snapshot: HomeFeedCardSnapshot): ActivityCardDto {
  const cardType = stringField(snapshot.card, "card_type");
  const createdAt = stringField(snapshot.card, "created_at");
  const pullRequest = findPullRequestLink(snapshot.links);
  const repository = pullRequest?.repo
    ? { fullName: pullRequest.repo, htmlUrl: repoUrl(pullRequest.repo) }
    : findRepositoryLink(snapshot.links);
  const normalized = normalizeHomeCardType(cardType);
  const actor = usesSyntheticActor(normalized.type)
    ? "GitHub Home"
    : (findActor(snapshot.links) ?? "GitHub Home");

  return {
    id: snapshot.id || fallbackId(cardType, repository?.fullName, createdAt),
    type: normalized.type,
    source: "github",
    actor,
    repo: repository?.fullName ?? "",
    createdAt,
    action: normalized.action,
    prNumber: pullRequest?.number,
    htmlUrl: pullRequest?.href ?? repository?.htmlUrl,
    title: pullRequest?.title ?? repository?.fullName,
    summary: cleanSummary(snapshot.text),
  };
}

function homeSnapshot(input: unknown): HomeFeedCardSnapshot {
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

function normalizeHomeCardType(cardType: string): { type: ActivityType; action: string } {
  if (cardType === "MERGED_PULL_REQUEST") return { type: "pull_request", action: "merged" };
  if (cardType === "PULL_REQUEST") return { type: "pull_request", action: "opened" };
  if (cardType === "FORKED_REPOSITORY") return { type: "fork", action: "forked" };
  if (cardType === "CREATED_REPOSITORY") return { type: "create", action: "created" };
  if (cardType === "STARRED_REPOSITORY") return { type: "watch", action: "started" };
  if (cardType === "TRENDING_REPOSITORY") return { type: "trending", action: "trending" };
  if (cardType === "REPOSITORY_RECOMMENDATION")
    return { type: "recommendation", action: "recommended" };
  if (cardType === "FOLLOWED_USER") return { type: "follow", action: "followed" };
  if (cardType === "ANNOUNCEMENT") return { type: "announcement", action: "announced" };
  if (cardType === "RELEASE") return { type: "release", action: "published" };
  return { type: "other", action: cardType.toLowerCase() };
}

function findPullRequestLink(links: HomeFeedLinkSnapshot[]):
  | {
      href: string;
      number: number;
      repo: string;
      title: string;
    }
  | undefined {
  for (const link of links) {
    const parsed = parseGithubUrl(link.href);
    if (!parsed || parsed.kind !== "pull") continue;
    return {
      href: link.href,
      number: parsed.number,
      repo: parsed.repo,
      title: link.text || `#${parsed.number}`,
    };
  }
  return undefined;
}

function findRepositoryLink(
  links: HomeFeedLinkSnapshot[],
): { fullName: string; htmlUrl: string } | undefined {
  for (const link of links) {
    const parsed = parseGithubUrl(link.href);
    if (!parsed || parsed.kind !== "repo") continue;
    if (link.text && !link.text.includes("/")) continue;
    return { fullName: parsed.repo, htmlUrl: link.href };
  }
  return undefined;
}

function findActor(links: HomeFeedLinkSnapshot[]): string | undefined {
  for (const link of links) {
    const parsed = parseGithubUrl(link.href);
    if (!parsed || parsed.kind !== "user") continue;
    const login = link.text || parsed.login;
    if (!login || login === "See more" || login === "people you follow") continue;
    return login;
  }
  return undefined;
}

function usesSyntheticActor(type: ActivityType): boolean {
  return type === "trending" || type === "recommendation";
}

function parseGithubUrl(
  href: string,
):
  | { kind: "repo"; repo: string }
  | { kind: "pull"; repo: string; number: number }
  | { kind: "user"; login: string }
  | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.hostname !== "github.com") return undefined;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1) return { kind: "user", login: parts[0] ?? "" };
  if (parts.length >= 4 && parts[2] === "pull") {
    const number = Number(parts[3]);
    if (Number.isInteger(number)) return { kind: "pull", repo: `${parts[0]}/${parts[1]}`, number };
  }
  if (parts.length === 2) return { kind: "repo", repo: `${parts[0]}/${parts[1]}` };
  return undefined;
}

function cleanSummary(text: string): string | undefined {
  const cleaned = cleanText(text);
  return cleaned ? cleaned : undefined;
}

function cleanText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function repoUrl(fullName: string): string {
  return `https://github.com/${fullName}`;
}

function fallbackId(cardType: string, repo: string | undefined, createdAt: string): string {
  return `github-home:${cardType}:${repo ?? "unknown"}:${createdAt}`;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
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

function absoluteGithubHref(href: string): string {
  try {
    return new URL(href, githubHomeUrl).href;
  } catch {
    return href;
  }
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
