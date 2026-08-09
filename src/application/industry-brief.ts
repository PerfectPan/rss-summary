import { Effect } from "effect";

import {
  buildCandidateProjects,
  type ActivityCard,
  type CandidateProject,
} from "../domain/digest.js";
import { isWithinEventWindow, resolveEventWindow } from "../domain/time.js";
import { type AppConfig, type FeedSubscription, loadConfig } from "../infrastructure/config.js";
import { createNotifier } from "../infrastructure/notifier.js";
import { RssClient } from "../infrastructure/rss.js";
import {
  filterNewCandidates,
  loadFeedState,
  markCandidatesSeen,
  saveFeedState,
  type FeedState,
} from "../infrastructure/state.js";
import { attempt } from "./effect.js";

export type IndustryBriefDocument = {
  generatedAt: string;
  displayDate?: string;
  windowLabel?: string;
  candidates: CandidateProject[];
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
  render: (document: IndustryBriefDocument) => string,
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const config = loadConfig();
    const { document, state } = yield* attempt(collectIndustryBrief(config));
    const output = render(document);

    yield* attempt(createNotifier({ webhookUrl: config.webhookUrl }).send(output));

    if (config.onlyNew && !config.dryRun) {
      markCandidatesSeen(state, document.candidates, document.generatedAt);
      saveFeedState(config.industryStateFile, state);
    }
  });
}

async function collectIndustryBrief(
  config: AppConfig,
): Promise<{ document: IndustryBriefDocument; state: FeedState }> {
  const rssClient = new RssClient();
  const rssEvents = await fetchIndustryRssEvents(rssClient, config.industryFeeds);
  const eventWindow = resolveEventWindow(config);
  const events = rssEvents.filter((event) => isWithinEventWindow(event, eventWindow));

  const allCandidates = buildCandidateProjects(events, {
    followees: new Set<string>(),
    interests: config.interests,
    repositories: new Map(),
  });

  const state = loadFeedState(config.industryStateFile);
  const candidates = config.onlyNew ? filterNewCandidates(allCandidates, state) : allCandidates;

  return {
    document: {
      generatedAt: new Date().toISOString(),
      windowLabel: eventWindow.label,
      candidates,
    },
    state,
  };
}

async function fetchIndustryRssEvents(
  client: RssClient,
  feeds: FeedSubscription[],
): Promise<ActivityCard[]> {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        return await client.getFeedEvents(feed);
      } catch {
        // A broken industry feed should not block the rest of the brief.
        return [];
      }
    }),
  );
  return results.flat();
}
