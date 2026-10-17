import type { Item, ItemKind, SignalType } from "../item.js";

export type ActivitySource = "github" | "rss" | "web";

export type ActivityType =
  | "watch"
  | "pull_request"
  | "release"
  | "fork"
  | "create"
  | "trending"
  | "recommendation"
  | "follow"
  | "announcement"
  | "article"
  | "paper"
  | "other";

/** Same field order as the historical activity card. JSON output depends on it. */
export type ActivityCardDto = {
  id: string;
  type: ActivityType;
  source?: ActivitySource;
  actor: string;
  repo: string;
  createdAt: string;
  action?: string;
  prNumber?: number;
  detailUrl?: string;
  htmlUrl?: string;
  title?: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
  tags?: string[];
};

export type RepositoryMetadata = {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  topics: string[];
  pushedAt: string | null;
};

export type PullRequestDetails = {
  title: string;
  htmlUrl: string;
  body: string | null;
};

export type Acquired = {
  item: Item;
  card: ActivityCardDto;
};

export function publicationAcquired(card: ActivityCardDto): Acquired {
  const kind: ItemKind =
    card.type === "paper" ? "paper" : card.type === "release" ? "release" : "publication";
  const signal: SignalType =
    card.type === "paper" ? "paper" : card.type === "release" ? "release" : "article";
  const sourceName = card.sourceName ?? card.actor;
  const label =
    card.type === "paper"
      ? `research paper: ${sourceName}`
      : card.type === "release"
        ? "new release published"
        : `${card.source === "web" ? "website source" : "rss feed"}: ${sourceName}`;

  return {
    card,
    item: {
      id: card.id,
      kind,
      subject: {
        key: `publication:${card.htmlUrl ?? card.id}`,
        name: card.actor,
        ...(card.sourceUrl ? { url: card.sourceUrl } : {}),
      },
      content: {
        ...(card.title ? { title: card.title } : {}),
        ...(card.summary ? { excerpt: card.summary } : {}),
        ...(card.htmlUrl ? { url: card.htmlUrl } : {}),
      },
      publishedAt: { value: card.createdAt, precision: "instant" },
      provenance: { origin: card.sourceUrl ?? card.actor },
      credibility: { tier: "unrated" },
      signals: [{ type: signal, label }],
      display: {
        ...(card.title ? { label: card.title } : {}),
        ...(card.htmlUrl ? { reference: card.htmlUrl } : {}),
        facts: [...(card.tags ?? [])],
      },
    },
  };
}
