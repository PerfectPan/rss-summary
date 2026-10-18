import { randomUUID } from "node:crypto";

import { Effect } from "effect";

import {
  applyScoringContext,
  collectIndustrySources,
  refreshRouting,
  RssFeed,
  WebPage,
} from "../../../acquisition/index.js";
import {
  scoreAcquired,
  selectResearchCandidates,
  type CandidateProject,
} from "../../../editorial/index.js";
import { researchKeyForCandidate } from "../../../acquisition/index.js";
import { candidateDecision } from "../subscriptions/output.js";
import { isWithinEventWindow, resolveEventWindow } from "../../../kernel/index.js";
import {
  deliver,
  FeedStateStore,
  filterUndelivered,
  filterUnresearched,
  loadFeedState,
  markDelivered,
  Notifier,
  RunArchive,
  DiagnosticsStore,
  type FeedState,
  type RunAudit,
} from "../../../delivery/index.js";
import type { AppConfig } from "../../config/env.js";
import type { AppServices } from "../../layers.js";

export type IndustryBriefDocument = {
  generatedAt: string;
  displayDate?: string;
  windowLabel?: string;
  candidates: CandidateProject[];
  audit?: RunAudit;
};

/**
 * Read-only frontier document: first-party sources only (no GitHub Home), with
 * an independent state file so it does not cross-contaminate the personal
 * digest's `--only-new`.
 */
export function buildIndustryDocument(
  config: AppConfig,
): Effect.Effect<IndustryBriefDocument, Error, IndustryServices> {
  return Effect.map(collectIndustryBrief(config), ({ document }) => document);
}

/** Full frontier workflow for the CLI. */
export function runIndustryFlow(
  config: AppConfig,
  render: (document: IndustryBriefDocument, format: AppConfig["outputFormat"]) => string,
): Effect.Effect<void, Error, AppServices> {
  return Effect.gen(function* () {
    const { audit, document, state } = yield* collectIndustryBrief(config);
    const output = render(document, config.outputFormat);

    const deliveredCandidates =
      config.outputFormat === "markdown"
        ? document.candidates.filter((candidate) => candidate.category !== "paper")
        : document.candidates;
    yield* deliver({
      runLogDir: config.runLogDir,
      audit,
      output,
      dryRun: config.dryRun,
      ...(config.onlyNew && !config.dryRun
        ? {
            afterSend: FeedStateStore.use((store) =>
              store.save(
                config.industryStateFile,
                markDelivered(
                  state,
                  deliveredCandidates.flatMap(industryEventIds),
                  document.generatedAt,
                ),
              ),
            ),
          }
        : {}),
    });
  });
}

export type IndustryServices =
  | RssFeed
  | WebPage
  | FeedStateStore
  | Notifier
  | RunArchive
  | DiagnosticsStore;

function collectIndustryBrief(
  config: AppConfig,
): Effect.Effect<
  { audit: RunAudit; document: IndustryBriefDocument; state: FeedState },
  Error,
  RssFeed | WebPage | FeedStateStore
> {
  return Effect.gen(function* () {
    const sourceCollection = yield* collectIndustrySources(config.industrySources);
    return yield* Effect.try({
      try: () => {
        const sourceEvents = sourceCollection.acquired;
        const eventWindow = resolveEventWindow(config);
        const acquired = sourceEvents.filter((entry) =>
          isWithinEventWindow(entry.card, eventWindow),
        );

        const rankedCandidates = scoreAcquired(
          acquired.map((entry) =>
            applyScoringContext(refreshRouting(entry), {
              followees: new Set<string>(),
              repositories: new Map(),
            }),
          ),
          { interests: config.interests, now: Date.now() },
        );
        const allCandidates = selectResearchCandidates(rankedCandidates, config.maxPapers);

        const state = loadFeedState(config.industryStateFile);
        const candidates = config.onlyNew
          ? filterUnresearched(
              filterUndelivered(allCandidates, industryEventIds, state),
              researchKeyForCandidate,
              state,
            )
          : allCandidates;

        const generatedAt = new Date().toISOString();
        const selectedSet = new Set(candidates);
        const researchSet = new Set(allCandidates);
        const audit: RunAudit = {
          version: 2,
          runId: randomUUID(),
          product: "frontier",
          generatedAt,
          windowLabel: eventWindow.label,
          sources: sourceCollection.sources,
          counts: {
            fetched: sourceEvents.length,
            inWindow: acquired.length,
            ranked: rankedCandidates.length,
            selected: candidates.filter((candidate) => candidate.category !== "paper").length,
            researchPending: candidates.filter((candidate) => candidate.category === "paper")
              .length,
          },
          candidates: rankedCandidates.map((candidate) =>
            candidateDecision(candidate, candidates, (value) => {
              if (!researchSet.has(value)) return "paper abstract did not pass interest or quota";
              if (config.onlyNew && state.researched[researchKeyForCandidate(value)]) {
                return "candidate was already researched";
              }
              if (config.onlyNew && !selectedSet.has(value))
                return "all events were already delivered";
              return "not selected";
            }),
          ),
        };
        return {
          audit,
          document: {
            generatedAt,
            windowLabel: eventWindow.label,
            candidates,
            audit,
          },
          state,
        };
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
  });
}

function industryEventIds(candidate: CandidateProject): string[] {
  return candidate.events.map((event) => event.id);
}
