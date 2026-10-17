import type {
  ActivityCardDto,
  ActivitySource,
  ActivityType,
  Acquired,
  RepositoryMetadata,
  SignalType,
} from "../../../acquisition/index.js";
import { formatCompactCount } from "../../../kernel/text.js";

export type ActivityCard = ActivityCardDto;

export type CandidateProject = {
  repo: string;
  source: ActivitySource;
  category: "discovery" | "release" | "activity" | "article" | "paper";
  score: number;
  actors: string[];
  eventTypes: ActivityType[];
  reasons: string[];
  matchedInterests?: string[];
  events: ActivityCard[];
  repository?: RepositoryMetadata;
  label?: string;
  url?: string;
  description?: string;
};

export type ScoreOptions = {
  interests: readonly string[];
  now: number;
};

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

export type PresentationDepth = "link" | "summary" | "research";

export type PresentationReasonCode =
  | "ordinary-update"
  | "semantic-summary"
  | "interest-match"
  | "major-release"
  | "breaking-change"
  | "deprecation"
  | "security-event"
  | "service-incident"
  | "paper-research";

export type PresentationDecision = {
  depth: PresentationDepth;
  reasonCode: PresentationReasonCode;
  evidence?: string;
};

export type PresentationPolicy = {
  linkLimit?: number;
  semanticSummaries?: boolean;
  summaryLimit?: number;
};

export const DEFAULT_LINK_SECTION_LIMIT = 20;
export const DEFAULT_SUMMARY_SECTION_LIMIT = 8;

export type CandidatePresentationSections = {
  links: CandidateProject[];
  summaries: CandidateProject[];
};

const importantContentRules: Array<{
  reasonCode: Exclude<
    PresentationReasonCode,
    "ordinary-update" | "interest-match" | "paper-research"
  >;
  pattern: RegExp;
}> = [
  {
    reasonCode: "security-event",
    pattern:
      /(?:安全漏洞|高危漏洞|供应链攻击|数据泄露)|\b(?:critical vulnerability|security advisory|security update|supply-chain attack|data breach)\b|\bCVE-\d{4}-\d{4,}\b/iu,
  },
  {
    reasonCode: "service-incident",
    pattern: /(?:重大故障|大规模中断)|\bmajor outage\b/iu,
  },
  {
    reasonCode: "breaking-change",
    pattern: /(?:重大变更|破坏性变更|不兼容)|\bbreaking changes?\b/iu,
  },
  {
    reasonCode: "deprecation",
    pattern: /(?:弃用|停止支持)|\b(?:deprecated|deprecation|end of support)\b/iu,
  },
  {
    reasonCode: "major-release",
    pattern:
      /(?:重大版本|正式发布|正式上线|开放公测|公开预览|全面可用)|\b(?:general availability|generally available|public preview|major release)\b/iu,
  },
];

/** Decide how much space a candidate deserves without coupling ranking to Markdown. */
export function presentationDepthForCandidate(
  candidate: CandidateProject,
  policy: PresentationPolicy = {},
): PresentationDepth {
  return presentationDecisionForCandidate(candidate, policy).depth;
}

export function presentationDecisionForCandidate(
  candidate: CandidateProject,
  policy: PresentationPolicy = {},
): PresentationDecision {
  if (candidate.category === "paper") return { depth: "research", reasonCode: "paper-research" };
  const interest = candidate.matchedInterests?.[0];
  if (interest) return { depth: "summary", reasonCode: "interest-match", evidence: interest };
  const content = [
    candidate.label,
    candidate.description,
    candidate.repository?.description,
    ...(candidate.repository?.topics ?? []),
    ...candidate.events.flatMap((event) => [event.title, event.summary, ...(event.tags ?? [])]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  for (const rule of importantContentRules) {
    const match = rule.pattern.exec(content);
    if (match) return { depth: "summary", reasonCode: rule.reasonCode, evidence: match[0] };
  }
  if (
    policy.semanticSummaries &&
    (candidate.category === "article" || candidate.eventTypes.includes("pull_request"))
  ) {
    return { depth: "summary", reasonCode: "semantic-summary" };
  }
  return { depth: "link", reasonCode: "ordinary-update" };
}

export function repositoryFactsForCandidate(candidate: CandidateProject): string[] {
  if (!candidate.repository || candidate.category !== "discovery") return [];
  return [
    `⭐ ${formatCompactCount(candidate.repository.stargazersCount)}`,
    candidate.repository.language ?? undefined,
  ].filter((value): value is string => Boolean(value));
}

/** Select the exact bounded candidates that a brief can render. */
export function selectCandidatePresentationSections(
  candidates: CandidateProject[],
  policy: PresentationPolicy = {},
): CandidatePresentationSections {
  const publishable = candidates.filter((candidate) => candidate.category !== "paper");
  return {
    summaries: publishable
      .filter((candidate) => presentationDepthForCandidate(candidate, policy) === "summary")
      .slice(0, policy.summaryLimit ?? DEFAULT_SUMMARY_SECTION_LIMIT),
    links: publishable
      .filter((candidate) => presentationDepthForCandidate(candidate, policy) === "link")
      .slice(0, policy.linkLimit ?? DEFAULT_LINK_SECTION_LIMIT),
  };
}

export type EditorialSelectionDecision = {
  ref: string;
  selected: boolean;
  reason: string;
};

type SelectionAudit = {
  counts: {
    fetched: number;
    inWindow: number;
    ranked: number;
    selected: number;
    researchPending: number;
  };
  candidates: ReadonlyArray<{ key: string; reason: string; status: string }>;
};

/** Write the model selection onto the run audit. Delivery stores the record. */
export function applyEditorialSelectionToAudit<T extends SelectionAudit>(
  audit: T,
  decisions: ReadonlyArray<EditorialSelectionDecision>,
  selectedCount: number,
): T & {
  editorialSelection: {
    decisions: EditorialSelectionDecision[];
    selectedCount: number;
  };
} {
  const decisionByRef = new Map(decisions.map((decision) => [decision.ref, decision]));
  return {
    ...audit,
    counts: { ...audit.counts, selected: selectedCount },
    candidates: audit.candidates.map((candidate) => {
      const decision = decisionByRef.get(candidate.key);
      return decision?.selected
        ? candidate
        : {
            ...candidate,
            reason: decision?.reason ?? "AI selection omitted this item",
            status: "filtered" as const,
          };
    }),
    editorialSelection: {
      decisions: [...decisions],
      selectedCount,
    },
  };
}
