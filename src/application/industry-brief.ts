import { randomUUID } from "node:crypto";
import { Effect } from "effect";

import {
  buildCandidateProjects,
  selectResearchCandidates,
  type CandidateProject,
} from "../domain/digest.js";
import { isWithinEventWindow, resolveEventWindow } from "../domain/time.js";
import { candidateDecision, type RunAudit } from "../domain/run-audit.js";
import { type AppConfig, loadConfig } from "../infrastructure/config.js";
import { RssClient } from "../infrastructure/rss.js";
import { collectRssFeeds } from "../infrastructure/rss-batch.js";
import {
  filterNewCandidates,
  filterUnresearchedCandidates,
  loadFeedState,
  markCandidatesSeen,
  saveFeedState,
  researchKeyForCandidate,
  type FeedState,
} from "../infrastructure/state.js";
import { attempt } from "./effect.js";
import { deliverAndRecord } from "./delivery.js";

export type IndustryBriefDocument = {
  generatedAt: string;
  displayDate?: string;
  windowLabel?: string;
  candidates: CandidateProject[];
  audit?: RunAudit;
};

/**
 * Read-only industry document for the Rivus Tool (observe-only: no state write, no webhook).
 * Presentation injects `render` at the entrypoint.
 */
export function buildIndustryDocument(
  config: AppConfig,
): Effect.Effect<IndustryBriefDocument, Error> {
  return Effect.map(attempt(collectIndustryBrief(config)), ({ document }) => document);
}

/**
 * Full industry workflow for the CLI. RSS-only (no GitHub Home), independent state file so
 * it does not cross-contaminate the personal digest's `--only-new`.
 */
export function runIndustry(
  render: (document: IndustryBriefDocument, format: AppConfig["outputFormat"]) => string,
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const config = loadConfig();
    const { audit, document, state } = yield* attempt(collectIndustryBrief(config));
    const output = render(document, config.outputFormat);

    const deliveredCandidates =
      config.outputFormat === "markdown"
        ? document.candidates.filter((candidate) => candidate.category !== "paper")
        : document.candidates;
    yield* attempt(
      deliverAndRecord(config, audit, output, {
        ...(config.onlyNew && !config.dryRun
          ? {
              afterSend: () => {
                markCandidatesSeen(state, deliveredCandidates, document.generatedAt);
                saveFeedState(config.industryStateFile, state);
              },
            }
          : {}),
      }),
    );
  });
}

async function collectIndustryBrief(
  config: AppConfig,
): Promise<{ audit: RunAudit; document: IndustryBriefDocument; state: FeedState }> {
  const rssClient = new RssClient();
  const rssCollection = await collectRssFeeds(rssClient, config.industryFeeds);
  const rssEvents = rssCollection.events;
  const eventWindow = resolveEventWindow(config);
  const events = rssEvents.filter((event) => isWithinEventWindow(event, eventWindow));

  const rankedCandidates = buildCandidateProjects(events, {
    followees: new Set<string>(),
    interests: config.interests,
    repositories: new Map(),
  });
  const allCandidates = selectResearchCandidates(rankedCandidates, config.maxPapers);

  const state = loadFeedState(config.industryStateFile);
  const candidates = config.onlyNew
    ? filterUnresearchedCandidates(filterNewCandidates(allCandidates, state), state)
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
    sources: rssCollection.sources,
    counts: {
      fetched: rssEvents.length,
      inWindow: events.length,
      ranked: rankedCandidates.length,
      selected: candidates.filter((candidate) => candidate.category !== "paper").length,
      researchPending: candidates.filter((candidate) => candidate.category === "paper").length,
    },
    candidates: rankedCandidates.map((candidate) =>
      candidateDecision(candidate, candidates, (value) => {
        if (!researchSet.has(value)) return "paper abstract did not pass interest or quota";
        if (config.onlyNew && state.researched[researchKeyForCandidate(value)]) {
          return "candidate was already researched";
        }
        if (config.onlyNew && !selectedSet.has(value)) return "all events were already delivered";
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
}
