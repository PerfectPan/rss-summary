import type {
  Acquired,
  ActivityCardDto,
  ActivityType,
  Item,
  ItemKind,
  SignalType,
} from "../../acquisition/index.js";

/**
 * The historical activity-card projection shared by every source service:
 * cards predate the neutral Item model, so their github-flavored event kinds
 * (watch, pull request, release, …) and their identity prefixes translate to
 * Items here, once, for rss, web pages, and GitHub alike.
 */
export function publicationAcquired(card: ActivityCardDto): Acquired {
  const kind: ItemKind =
    card.type === "paper" ? "paper" : card.type === "release" ? "release" : "publication";
  const signal: SignalType =
    card.type === "paper"
      ? "published-paper"
      : card.type === "release"
        ? "released"
        : "published-article";
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

export function itemFromGitHubCard(card: ActivityCardDto): Item {
  const signal = signalFor(card);
  const reference = card.htmlUrl;
  return {
    id: card.id,
    kind: kindFor(card.type),
    subject: {
      key: subjectKey(card),
      name: card.repo || card.actor,
      ...(reference ? { url: reference } : {}),
    },
    content: {
      ...(card.title ? { title: card.title } : {}),
      ...(card.summary ? { excerpt: card.summary } : {}),
      ...(reference ? { url: reference } : {}),
    },
    publishedAt: { value: card.createdAt, precision: "instant" },
    provenance: {
      origin: reference || (card.repo ? `https://github.com/${card.repo}` : card.actor),
      ...(card.actor ? { actor: { name: card.actor, followed: false } } : {}),
    },
    credibility: { tier: "unrated" },
    signals: signal ? [signal] : [],
    display: {
      ...(displayLabel(card) ? { label: displayLabel(card) } : {}),
      ...(reference ? { reference } : {}),
      facts: [],
    },
  };
}

function signalFor(card: ActivityCardDto): { type: SignalType; label: string } | undefined {
  if (card.type === "watch") return { type: "endorsed", label: "followee starred this repository" };
  if (card.type === "trending")
    return { type: "recommended-trending", label: "GitHub Home trending repository" };
  if (card.type === "recommendation")
    return { type: "recommended-personal", label: "GitHub Home recommendation" };
  if (card.type === "announcement") return { type: "announced", label: "GitHub Home announcement" };
  if (card.type === "release") return { type: "released", label: "new release published" };
  if (card.type === "fork") return { type: "forked", label: "followed actor forked repository" };
  if (card.type === "create") return { type: "created", label: "new repository created" };
  if (card.type === "follow")
    return { type: "relationship", label: "follow relationship from GitHub Home" };
  if (card.type === "pull_request" && card.action === "merged") {
    return { type: "change-merged", label: "pull request merged" };
  }
  if (card.type === "pull_request" && card.action === "opened") {
    return { type: "change-opened", label: "pull request opened" };
  }
  if (card.type === "pull_request" && card.action === "closed") {
    return { type: "change-closed", label: "pull request closed" };
  }
  if (card.type === "pull_request") return { type: "change-other", label: "pull request" };
  return undefined;
}

function kindFor(type: ActivityType): ItemKind {
  if (type === "release") return "release";
  if (type === "pull_request") return "change";
  if (type === "announcement") return "post";
  if (type === "article") return "publication";
  if (type === "paper") return "paper";
  return "project";
}

function subjectKey(card: ActivityCardDto): string {
  if (card.type === "pull_request") {
    return `github-pull-request:${card.repo}:${card.prNumber ?? card.id}`;
  }
  if (card.type === "release") return `github-release:${card.htmlUrl ?? card.id}`;
  return `github-repository:${card.repo}`;
}

function displayLabel(card: ActivityCardDto): string | undefined {
  if (card.type !== "pull_request") return card.title;
  const number = card.prNumber ? ` #${card.prNumber}` : "";
  const title = card.title ? ` · ${card.title}` : "";
  return `${card.repo}${number}${title}`;
}
