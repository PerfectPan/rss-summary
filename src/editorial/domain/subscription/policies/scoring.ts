import type {
  Acquired,
  ActivitySource,
  ActivityType,
  SignalType,
} from "../../../../acquisition/index.js";
import type { CandidateProject, ScoreOptions } from "../value-objects/candidate.js";

const signalWeight: Record<SignalType, number> = {
  endorsed: 90,
  "recommended-trending": 80,
  "recommended-personal": 75,
  announced: 65,
  released: 85,
  forked: 45,
  created: 35,
  relationship: 25,
  "published-article": 30,
  "published-paper": 35,
  "change-merged": 55,
  "change-opened": 35,
  "change-closed": 20,
  "change-other": 5,
};

function deferredReason(type: SignalType): boolean {
  return type === "published-article" || type === "published-paper";
}

/** Signal labels that the historical scorer copied into reasons. Weights still apply to the rest. */
const labeledSignals = new Set<SignalType>([
  "endorsed",
  "recommended-trending",
  "recommended-personal",
  "announced",
  "released",
  "forked",
  "created",
  "relationship",
  "published-article",
  "published-paper",
  "change-merged",
]);

export function scoreAcquired(
  acquired: readonly Acquired[],
  options: ScoreOptions,
): CandidateProject[] {
  const groups = new Map<string, Acquired[]>();
  for (const entry of acquired) {
    if (entry.card.type === "other") continue;
    const key = entry.item.routing?.groupKey;
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()]
    .map((group) => scoreGroup(group, options))
    .sort((left, right) => right.score - left.score || left.repo.localeCompare(right.repo));
}

/**
 * Keep papers as a bounded research queue. A paper must match configured interests in its
 * abstract; title-only matches are intentionally insufficient for entering the queue.
 */
export function selectResearchCandidates(
  candidates: CandidateProject[],
  maxPapers: number,
): CandidateProject[] {
  const selectedPapers = new Set(
    candidates
      .filter((candidate) => candidate.category === "paper")
      .filter((candidate) =>
        candidate.reasons.some((reason) => reason.startsWith("matches paper abstract: ")),
      )
      .slice(0, maxPapers),
  );
  return candidates.filter(
    (candidate) => candidate.category !== "paper" || selectedPapers.has(candidate),
  );
}

function scoreGroup(inserted: Acquired[], options: ScoreOptions): CandidateProject {
  const first = inserted[0]!;
  const repo = first.card.repo;
  const actors = [
    ...new Set(
      inserted.map((entry) => entry.item.provenance.actor?.name ?? "").filter((name) => name),
    ),
  ];
  const eventTypes = [...new Set(inserted.map((entry) => entry.card.type))];
  const reasons = new Set<string>();
  let score = 0;

  for (const entry of inserted) {
    for (const signal of entry.item.signals) {
      score += signalWeight[signal.type] ?? 0;
      if (labeledSignals.has(signal.type) && !deferredReason(signal.type))
        reasons.add(signal.label);
    }
    const actor = entry.item.provenance.actor;
    if (actor?.followed) {
      score += 30;
      reasons.add(`followed actor: ${actor.name}`);
    }
    for (const signal of entry.item.signals) {
      if (deferredReason(signal.type)) reasons.add(signal.label);
    }
  }

  if (actors.length > 1) {
    score += 20 + actors.length * 5;
    reasons.add("multiple followed mentions");
  }

  const profileText = repositoryText(first);
  const matchedInterests = profileText ? matchTokens(profileText, options.interests) : [];
  for (const interest of matchedInterests) {
    score += 15;
    reasons.add(`matches interest: ${interest}`);
  }

  const paper = eventTypes.includes("paper");
  const eventInterests = matchTokens(
    paper ? paperAbstract(inserted) : inserted.map(eventText).join(" "),
    options.interests,
  );
  for (const interest of eventInterests) {
    score += 20;
    reasons.add(paper ? `matches paper abstract: ${interest}` : `matches interest: ${interest}`);
  }

  const profile = first.item.subject.profile;
  if (profile?.popularity !== undefined) {
    score += Math.min(25, Math.log10(Math.max(1, profile.popularity)) * 6);
  }
  if (profile?.lastActiveAt && daysSince(profile.lastActiveAt, options.now) <= 14) {
    score += 8;
    reasons.add("recently active repository");
  }

  const sorted = inserted
    .slice()
    .sort((left, right) => right.card.createdAt.localeCompare(left.card.createdAt));
  const publication = sorted.find((entry) => entry.item.routing?.role === "publication");
  const change = sorted.find((entry) => entry.item.routing?.role === "change");
  const routing = first.item.routing!;

  return {
    repo,
    source: strongestChannel(inserted),
    category: categoryFor(eventTypes),
    score: Math.round(score),
    actors,
    eventTypes,
    reasons: [...reasons],
    matchedInterests: [...new Set([...matchedInterests, ...eventInterests])],
    events: sorted.map((entry) => entry.card),
    repository: routing.record,
    label: labelFor(repo, routing.strippedRepo, publication, change),
    url: urlFor(first, publication, change),
    description: descriptionFor(publication, change),
  };
}

function strongestChannel(items: readonly Acquired[]): ActivitySource {
  let best = items[0]!.item.routing!;
  for (const entry of items) {
    const routing = entry.item.routing!;
    if (routing.channelRank > best.channelRank) best = routing;
  }
  return best.channel as ActivitySource;
}

function categoryFor(types: readonly ActivityType[]): CandidateProject["category"] {
  if (types.includes("paper")) return "paper";
  if (types.includes("article")) return "article";
  if (
    types.includes("watch") ||
    types.includes("fork") ||
    types.includes("create") ||
    types.includes("trending") ||
    types.includes("recommendation") ||
    types.includes("follow")
  ) {
    return "discovery";
  }
  if (types.includes("release")) return "release";
  return "activity";
}

function eventText(entry: Acquired): string {
  const content = entry.item.content;
  return [
    content.title ?? "",
    content.excerpt ?? "",
    content.url ?? "",
    ...(content.keywords ?? []),
  ].join(" ");
}

function paperAbstract(items: readonly Acquired[]): string {
  return items
    .filter((entry) => entry.card.type === "paper")
    .map((entry) => entry.item.content.excerpt ?? "")
    .join(" ");
}

function repositoryText(entry: Acquired): string | undefined {
  const profile = entry.item.subject.profile;
  if (!profile) return undefined;
  return [entry.item.subject.name, profile.description ?? "", ...profile.keywords].join(" ");
}

function matchTokens(value: string, interests: readonly string[]): string[] {
  const tokens = tokenize(value);
  return interests.filter((interest) => {
    const interestTokens = [...tokenize(interest)];
    return interestTokens.length > 0 && interestTokens.every((token) => tokens.has(token));
  });
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function daysSince(isoDate: string, now: number): number {
  return (now - new Date(isoDate).getTime()) / 86_400_000;
}

function labelFor(
  repo: string,
  strippedRepo: string,
  publication: Acquired | undefined,
  change: Acquired | undefined,
): string | undefined {
  const published = publication?.item.routing;
  if (published) return "titleLabel" in published ? published.titleLabel : strippedRepo;
  const pull = change?.item.routing;
  if (pull && "prSuffix" in pull) return `${repo}${pull.prSuffix ?? ""}`;
  return undefined;
}

function urlFor(
  first: Acquired,
  publication: Acquired | undefined,
  change: Acquired | undefined,
): string | undefined {
  const published = publication?.item.routing;
  if (published && "directUrl" in published && published.directUrl !== undefined) {
    return published.directUrl;
  }
  const pull = change?.item.routing;
  if (pull && "directUrl" in pull && pull.directUrl !== undefined) return pull.directUrl;
  const record = first.item.routing?.record;
  if (record) return record.htmlUrl;
  return first.item.routing?.fallbackUrl;
}

function descriptionFor(
  publication: Acquired | undefined,
  change: Acquired | undefined,
): string | undefined {
  const published = publication?.item.routing;
  if (published && "description" in published) return published.description;
  const pull = change?.item.routing;
  if (pull && "description" in pull) return pull.description;
  return undefined;
}
