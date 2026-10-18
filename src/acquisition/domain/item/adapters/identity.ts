import type { ActivityCardDto, ActivitySource, ActivityType } from "./activity-card.js";

/**
 * Historical identity keys for a candidate aggregate. The prefixes spell the
 * source that produced the event, so the formulas live beside the adapter that
 * generates the underlying card ids; editorial treats the strings as opaque.
 */
export type IdentitySubject = {
  events: ReadonlyArray<
    Pick<ActivityCardDto, "id" | "type" | "source" | "repo" | "prNumber" | "htmlUrl">
  >;
  source: ActivitySource;
  /** Candidate categories are compared structurally; see editorial's aggregate. */
  category: ActivityType | (string & {});
  repo: string;
  url?: string;
};

function activityIdentity(event: {
  type: ActivityType;
  source?: ActivitySource;
  repo: string;
  prNumber?: number;
  id: string;
  htmlUrl?: string;
}): string {
  if (event.type === "pull_request") {
    return `github-pull-request:${event.repo}:${event.prNumber ?? event.id}`;
  }
  if (
    event.source === "rss" ||
    event.source === "web" ||
    event.type === "article" ||
    event.type === "paper"
  ) {
    return `publication:${event.htmlUrl ?? event.id}`;
  }
  if (event.type === "release") return `github-release:${event.htmlUrl ?? event.id}`;
  return `github-repository:${event.repo}`;
}

/** Stable semantic identity used by audits and the delivery ledger. */
export function candidateIdentity(candidate: IdentitySubject): string {
  const event = candidate.events[0];
  if (event) return activityIdentity(event);
  if (candidate.source === "rss" || candidate.source === "web")
    return `publication:${candidate.url ?? candidate.repo}`;
  if (candidate.category === "release") return `github-release:${candidate.url ?? candidate.repo}`;
  return `github-repository:${candidate.repo}`;
}

/** Research ledger key; prefixes follow the same historical scheme. */
export function researchKeyForCandidate(candidate: IdentitySubject): string {
  if (
    candidate.source === "rss" ||
    candidate.source === "web" ||
    candidate.category === "article" ||
    candidate.category === "paper"
  ) {
    return `${candidate.source === "web" ? "web" : "rss"}:${candidate.url ?? candidate.repo}`;
  }
  return `github:${candidate.repo}`;
}

/** Fallback URL for evidence projection when no candidate URL exists. */
export function candidateEvidenceUrl(candidate: { repo: string }): string {
  return `https://github.com/${candidate.repo}`;
}
