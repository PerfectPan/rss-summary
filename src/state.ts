import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { CandidateProject } from "./domain.js";

export type FeedState = {
  seen: Record<string, string>;
  researched: Record<string, ResearchRecord>;
};

export type ResearchRecord = {
  at: string;
  decision?: string;
  reason?: string;
};

export function createEmptyFeedState(): FeedState {
  return {
    seen: {},
    researched: {},
  };
}

export function loadFeedState(path: string): FeedState {
  if (!existsSync(path)) return createEmptyFeedState();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FeedState>;
  return {
    seen: parsed.seen ?? {},
    researched: parsed.researched ?? {},
  };
}

export function saveFeedState(path: string, state: FeedState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function filterNewCandidates(candidates: CandidateProject[], state: FeedState): CandidateProject[] {
  return candidates.filter((candidate) => candidate.events.some((event) => event.id && !state.seen[event.id]));
}

export function filterUnresearchedCandidates(candidates: CandidateProject[], state: FeedState): CandidateProject[] {
  return candidates.filter((candidate) => !state.researched[researchKeyForCandidate(candidate)]);
}

export function markCandidatesSeen(candidatesState: FeedState, candidates: CandidateProject[], seenAt: string): void {
  for (const candidate of candidates) {
    for (const event of candidate.events) {
      if (event.id) {
        candidatesState.seen[event.id] = seenAt;
      }
    }
  }
}

export function markCandidateResearched(
  state: FeedState,
  candidate: CandidateProject,
  record: ResearchRecord,
): void {
  state.researched[researchKeyForCandidate(candidate)] = record;
}

export function researchKeyForCandidate(candidate: CandidateProject): string {
  if (candidate.source === "rss" || candidate.category === "article") {
    return `rss:${candidate.url ?? candidate.repo}`;
  }
  return `github:${candidate.repo}`;
}
