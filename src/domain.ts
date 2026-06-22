export type ActivityType = "watch" | "pull_request" | "release" | "fork" | "create" | "other";

export type ActivityCard = {
  id: string;
  type: ActivityType;
  actor: string;
  repo: string;
  createdAt: string;
  action?: string;
  prNumber?: number;
  detailUrl?: string;
  htmlUrl?: string;
  title?: string;
  summary?: string;
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

export type CandidateProject = {
  repo: string;
  category: "discovery" | "release" | "activity";
  score: number;
  actors: string[];
  eventTypes: ActivityType[];
  reasons: string[];
  events: ActivityCard[];
  repository?: RepositoryMetadata;
};

export type BuildCandidatesContext = {
  followees: Set<string>;
  interests: string[];
  repositories: Map<string, RepositoryMetadata>;
};

type RawEvent = {
  id?: unknown;
  type?: unknown;
  actor?: { login?: unknown };
  repo?: { name?: unknown };
  created_at?: unknown;
  payload?: Record<string, unknown>;
};

export function normalizeEvent(input: unknown): ActivityCard {
  const raw = asRecord(input) as RawEvent;
  const githubType = asString(raw.type);
  const payload = raw.payload ?? {};
  const repo = asString(raw.repo?.name);

  const base = {
    id: asString(raw.id),
    actor: asString(raw.actor?.login),
    repo,
    createdAt: asString(raw.created_at),
    action: optionalString(payload.action),
  };

  if (githubType === "WatchEvent") {
    return { ...base, type: "watch" };
  }

  if (githubType === "PullRequestEvent") {
    const pullRequest = asRecord(payload.pull_request);
    return {
      ...base,
      type: "pull_request",
      prNumber: optionalNumber(payload.number),
      detailUrl: optionalString(pullRequest.url),
      htmlUrl: optionalString(pullRequest.html_url),
      title: optionalString(pullRequest.title),
      summary: optionalString(pullRequest.body),
    };
  }

  if (githubType === "ReleaseEvent") {
    const release = asRecord(payload.release);
    return {
      ...base,
      type: "release",
      detailUrl: optionalString(release.url),
      htmlUrl: optionalString(release.html_url),
      title: optionalString(release.name) ?? optionalString(release.tag_name),
      summary: optionalString(release.body),
    };
  }

  if (githubType === "ForkEvent") {
    return { ...base, type: "fork" };
  }

  if (githubType === "CreateEvent") {
    if (payload.ref_type !== "repository") {
      return { ...base, type: "other" };
    }
    return { ...base, type: "create" };
  }

  return { ...base, type: "other" };
}

export function buildCandidateProjects(
  events: ActivityCard[],
  context: BuildCandidatesContext,
): CandidateProject[] {
  const byRepo = new Map<string, ActivityCard[]>();

  for (const event of events) {
    if (!isHighSignal(event)) continue;
    const existing = byRepo.get(event.repo) ?? [];
    existing.push(event);
    byRepo.set(event.repo, existing);
  }

  return [...byRepo.entries()]
    .map(([repo, repoEvents]) => scoreRepo(repo, repoEvents, context))
    .sort((a, b) => b.score - a.score || a.repo.localeCompare(b.repo));
}

function scoreRepo(
  repo: string,
  events: ActivityCard[],
  context: BuildCandidatesContext,
): CandidateProject {
  const actors = unique(events.map((event) => event.actor).filter(Boolean));
  const eventTypes = unique(events.map((event) => event.type));
  const repository = context.repositories.get(repo);
  const reasons = new Set<string>();
  let score = 0;

  for (const event of events) {
    score += baseScore(event);
    if (event.type === "watch") reasons.add("followee starred this repository");
    if (event.type === "release") reasons.add("new release published");
    if (event.type === "pull_request" && event.action === "merged") reasons.add("important PR merged");
    if (context.followees.has(event.actor)) {
      score += 30;
      reasons.add(`followed actor: ${event.actor}`);
    }
  }

  if (actors.length > 1) {
    score += 20 + actors.length * 5;
    reasons.add("multiple followed signals");
  }

  const matchedInterests = matchInterests(repository, context.interests);
  for (const interest of matchedInterests) {
    score += 15;
    reasons.add(`matches interest: ${interest}`);
  }

  if (repository) {
    score += Math.min(25, Math.log10(Math.max(1, repository.stargazersCount)) * 6);
    if (repository.pushedAt && daysSince(repository.pushedAt) <= 14) {
      score += 8;
      reasons.add("recently active repository");
    }
  }

  return {
    repo,
    category: categoryFor(eventTypes),
    score: Math.round(score),
    actors,
    eventTypes,
    reasons: [...reasons],
    events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    repository,
  };
}

function isHighSignal(event: ActivityCard): boolean {
  return event.type !== "other";
}

function baseScore(event: ActivityCard): number {
  if (event.type === "watch") return 90;
  if (event.type === "release") return 85;
  if (event.type === "fork") return 45;
  if (event.type === "create") return 35;
  if (event.type === "pull_request") {
    if (event.action === "merged") return 55;
    if (event.action === "opened") return 35;
    if (event.action === "closed") return 20;
    return 5;
  }
  return 0;
}

function categoryFor(types: ActivityType[]): CandidateProject["category"] {
  if (types.includes("watch") || types.includes("fork") || types.includes("create")) {
    return "discovery";
  }
  if (types.includes("release")) return "release";
  return "activity";
}

function matchInterests(repository: RepositoryMetadata | undefined, interests: string[]): string[] {
  if (!repository) return [];
  const tokens = tokenize(
    [
    repository.fullName,
    repository.description ?? "",
    repository.language ?? "",
    ...repository.topics,
  ]
      .join(" "),
  );

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

function daysSince(isoDate: string): number {
  const elapsed = Date.now() - new Date(isoDate).getTime();
  return elapsed / 86_400_000;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
