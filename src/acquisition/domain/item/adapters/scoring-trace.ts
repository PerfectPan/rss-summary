import type { Item, ItemRouting } from "../item.js";
import {
  publicationAcquired,
  type Acquired,
  type ActivityCardDto,
  type RepositoryMetadata,
} from "./activity-card.js";
import { itemFromGitHubCard } from "./github-event.js";

export type ScoringContext = {
  followees: ReadonlySet<string>;
  repositories: ReadonlyMap<string, RepositoryMetadata>;
};

/** Group key used by candidate identity. Adapters own the spelling. */
export function activityGroupKey(card: ActivityCardDto): string {
  if (card.type === "pull_request") {
    return `github-pull-request:${card.repo}:${card.prNumber ?? card.id}`;
  }
  if (
    card.source === "rss" ||
    card.source === "web" ||
    card.type === "article" ||
    card.type === "paper"
  ) {
    return `publication:${card.htmlUrl ?? card.id}`;
  }
  if (card.type === "release") return `github-release:${card.htmlUrl ?? card.id}`;
  return `github-repository:${card.repo}`;
}

export function acquireActivityCard(card: ActivityCardDto): Acquired {
  // Article and paper signals are not on the repository card. A web or feed
  // source still changes grouping for every other type, without replacing its signal.
  const base =
    card.type === "article" || card.type === "paper"
      ? publicationAcquired(card)
      : { card, item: itemFromGitHubCard(card) };
  return { card, item: withRouting(base.item, card) };
}

export function projectActivity(card: ActivityCardDto, context: ScoringContext): Acquired {
  return applyScoringContext(acquireActivityCard(card), context);
}

export function applyScoringContext(acquired: Acquired, context: ScoringContext): Acquired {
  const routed = acquired.item.routing
    ? acquired
    : { ...acquired, item: withRouting(acquired.item, acquired.card) };
  const actorName = routed.card.actor;
  const repository = context.repositories.get(routed.card.repo);
  const item: Item = {
    ...routed.item,
    provenance: {
      ...routed.item.provenance,
      actor: { name: actorName, followed: context.followees.has(actorName) },
    },
  };
  if (!repository || !item.routing) return { card: routed.card, item };
  return {
    card: routed.card,
    item: {
      ...item,
      subject: {
        ...item.subject,
        name: repository.fullName,
        profile: {
          ...(repository.description ? { description: repository.description } : {}),
          keywords: [...repository.topics, ...(repository.language ? [repository.language] : [])],
          popularity: repository.stargazersCount,
          ...(repository.pushedAt ? { lastActiveAt: repository.pushedAt } : {}),
        },
      },
      routing: { ...item.routing, record: repository },
    },
  };
}

/** Rebuild routing after a card's title, summary, or URL was filled in. */
export function refreshRouting(acquired: Acquired): Acquired {
  const next = acquireActivityCard(acquired.card);
  const profile = acquired.item.subject.profile;
  const record = acquired.item.routing?.record;
  const followed = acquired.item.provenance.actor?.followed ?? false;
  const routing = next.item.routing;
  return {
    card: acquired.card,
    item: {
      ...next.item,
      provenance: {
        ...next.item.provenance,
        ...(next.item.provenance.actor
          ? { actor: { ...next.item.provenance.actor, followed } }
          : {}),
      },
      subject: profile
        ? { ...next.item.subject, name: acquired.item.subject.name, profile }
        : next.item.subject,
      ...(routing && record ? { routing: { ...routing, record } } : {}),
    },
  };
}

function withRouting(item: Item, card: ActivityCardDto): Item {
  const routing = routingFor(card);
  return {
    ...item,
    subject: { ...item.subject, key: routing.groupKey },
    content: {
      ...item.content,
      keywords: [...(card.tags ?? []), ...(card.sourceName ? [card.sourceName] : [])],
    },
    routing,
  };
}

function routingFor(card: ActivityCardDto): ItemRouting {
  const publication = isPublication(card);
  const change = card.type === "pull_request";
  const channel = channelFor(card);
  const directUrl = publication
    ? card.htmlUrl !== undefined || card.sourceUrl !== undefined
      ? (card.htmlUrl ?? card.sourceUrl)
      : undefined
    : change
      ? card.htmlUrl
      : undefined;
  return {
    groupKey: activityGroupKey(card),
    channel: channel.name,
    channelRank: channel.rank,
    contentResearch: publication || card.type === "article" || card.type === "paper",
    feedPrefix: "rss",
    sitePrefix: "web",
    catalogResearchKey: `github:${card.repo}`,
    role: publication ? "publication" : change ? "change" : "other",
    ...(publication && card.title !== undefined ? { titleLabel: card.title } : {}),
    ...(change ? { prSuffix: pullSuffix(card) } : {}),
    strippedRepo: card.repo.replace(/^(?:rss|web):/u, ""),
    ...(directUrl !== undefined ? { directUrl } : {}),
    ...((publication || change) && card.summary !== undefined ? { description: card.summary } : {}),
    fallbackUrl: `https://github.com/${card.repo}`,
  };
}

function channelFor(card: ActivityCardDto): { name: string; rank: number } {
  if (card.source === "web") return { name: "web", rank: 3 };
  if (card.source === "rss" || card.type === "article") return { name: "rss", rank: 2 };
  return { name: "github", rank: 1 };
}

function isPublication(card: ActivityCardDto): boolean {
  return (
    card.source === "rss" ||
    card.source === "web" ||
    card.type === "article" ||
    card.type === "paper"
  );
}

function pullSuffix(card: ActivityCardDto): string {
  const number = card.prNumber ? ` #${card.prNumber}` : "";
  const title = card.title ? ` · ${card.title}` : "";
  return `${number}${title}`;
}
