import type { Acquired, ActivityCardDto, ActivityType } from "../../../acquisition/index.js";

import { itemFromGitHubCard } from "../../shared/activity-card.js";
import { homeSnapshot, type HomeFeedCardSnapshot, type HomeFeedLinkSnapshot } from "./dto.js";

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
