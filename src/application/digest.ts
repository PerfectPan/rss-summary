import { randomUUID } from "node:crypto";
import { Effect } from "effect";

import {
  buildCandidateProjects,
  normalizeEvent,
  selectResearchCandidates,
  type ActivityCard,
  type DigestDocument,
  type RepositoryMetadata,
} from "../domain/digest.js";
import { isWithinEventWindow, resolveEventWindow } from "../domain/time.js";
import { candidateDecision, type RunAudit, type RunSourceResult } from "../domain/run-audit.js";
import { loadConfig, type AppConfig } from "../infrastructure/config.js";
import { GitHubClient } from "../infrastructure/github.js";
import { GitHubHomeClient } from "../infrastructure/github-home.js";
import { RssClient } from "../infrastructure/rss.js";
import { collectRssFeeds } from "../infrastructure/rss-batch.js";
import {
  filterNewCandidates,
  loadFeedState,
  markCandidatesSeen,
  saveFeedState,
  type FeedState,
} from "../infrastructure/state.js";
import { attempt } from "./effect.js";
import { deliverAndRecord } from "./delivery.js";
import { errorMessage } from "../infrastructure/parsing.js";

export type { DigestDocument };

/**
 * Full digest workflow. Presentation injects `render` so application never imports
 * presentation modules (dependency rule: application ↛ presentation).
 */
export function run(
  render: (document: DigestDocument, format: AppConfig["outputFormat"]) => string,
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const config = loadConfig();
    const { audit, document, state } = yield* attempt(collectDigest(config));
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
                saveFeedState(config.stateFile, state);
              },
            }
          : {}),
      }),
    );
  });
}

export function buildDigestDocument(config: AppConfig): Effect.Effect<DigestDocument, Error> {
  return Effect.map(attempt(collectDigest(config)), ({ document }) => document);
}

async function collectDigest(
  config: AppConfig,
): Promise<{ audit: RunAudit; document: DigestDocument; state: FeedState }> {
  const client = new GitHubClient({ token: config.token });
  const rssClient = new RssClient();

  const [githubResult, rssResult] = await Promise.allSettled([
    config.rssOnly ? Promise.resolve([]) : fetchGithubEvents(config, client),
    collectRssFeeds(rssClient, config.rssFeeds),
  ]);
  const githubEvents = githubResult.status === "fulfilled" ? githubResult.value : [];
  const rssCollection =
    rssResult.status === "fulfilled" ? rssResult.value : { events: [], sources: [] };
  const rssEvents = rssCollection.events;
  if (githubResult.status === "rejected") {
    console.error(
      `GitHub feed unavailable; continuing with RSS events: ${errorMessage(githubResult.reason)}`,
    );
  }
  if (rssResult.status === "rejected") {
    console.error(
      `RSS feeds unavailable; continuing with GitHub events: ${errorMessage(rssResult.reason)}`,
    );
  }
  const eventWindow = resolveEventWindow(config);
  const events = [...githubEvents, ...rssEvents].filter((event) =>
    isWithinEventWindow(event, eventWindow),
  );

  const followees =
    config.token && !config.rssOnly ? await fetchFollowees(client) : new Set<string>();
  const repositories = config.rssOnly
    ? new Map<string, RepositoryMetadata>()
    : await fetchRepositoryMetadata(client, events, config.maxRepos);
  if (!config.rssOnly) {
    await enrichPullRequests(client, events);
  }

  const rankedCandidates = buildCandidateProjects(events, {
    followees,
    interests: config.interests,
    repositories,
  });
  const allCandidates = selectResearchCandidates(rankedCandidates, config.maxPapers);
  const state = loadFeedState(config.stateFile);
  const candidates = config.onlyNew ? filterNewCandidates(allCandidates, state) : allCandidates;

  const generatedAt = new Date().toISOString();
  const document: DigestDocument = {
    generatedAt,
    username: config.username,
    sourceMode: config.rssOnly ? "rss" : "mixed",
    windowLabel: eventWindow.label,
    candidates,
  };
  const githubSource: RunSourceResult = {
    id: config.githubFeedSource,
    kind: config.githubFeedSource === "home" ? "github-home" : "github-events",
    name: config.githubFeedSource === "home" ? "GitHub Home" : "GitHub received events",
    status: config.rssOnly ? "skipped" : githubResult.status === "fulfilled" ? "ok" : "failed",
    itemCount: githubEvents.length,
    ...(githubResult.status === "rejected" ? { error: errorMessage(githubResult.reason) } : {}),
  };
  const selectedSet = new Set(candidates);
  const researchSet = new Set(allCandidates);
  const audit: RunAudit = {
    version: 2,
    runId: randomUUID(),
    product: "subscriptions",
    generatedAt,
    windowLabel: eventWindow.label,
    sources: [githubSource, ...rssCollection.sources],
    counts: {
      fetched: githubEvents.length + rssEvents.length,
      inWindow: events.length,
      ranked: rankedCandidates.length,
      selected: candidates.filter((candidate) => candidate.category !== "paper").length,
      researchPending: candidates.filter((candidate) => candidate.category === "paper").length,
    },
    candidates: rankedCandidates.map((candidate) =>
      candidateDecision(
        candidate,
        candidates,
        (value) => {
          if (!researchSet.has(value)) return "paper abstract did not pass interest or quota";
          if (config.onlyNew && !selectedSet.has(value)) return "all events were already delivered";
          return "not selected";
        },
        { semanticSummaries: true },
      ),
    ),
  };
  document.audit = audit;
  return { audit, document, state };
}

async function fetchGithubEvents(config: AppConfig, client: GitHubClient): Promise<ActivityCard[]> {
  if (config.githubFeedSource === "home") {
    return new GitHubHomeClient({
      storageState: config.githubHomeStorageState,
      fetchMode: config.githubHomeFetch,
      browserChannel: process.env.GITHUB_HOME_BROWSER_CHANNEL,
    }).getHomeEvents();
  }

  const rawEvents = await client.getReceivedEvents(config.username, {
    perPage: config.perPage,
    pages: config.eventPages,
  });
  return rawEvents.map(normalizeEvent);
}

async function fetchRepositoryMetadata(
  client: GitHubClient,
  events: ActivityCard[],
  maxRepos: number,
): Promise<Map<string, RepositoryMetadata>> {
  const repositories = new Map<string, RepositoryMetadata>();
  const names = [
    ...new Set(
      events
        .filter((event) => event.type !== "other")
        .filter((event) => event.source !== "rss")
        .map((event) => event.repo)
        .filter(Boolean),
    ),
  ].slice(0, maxRepos);

  await Promise.all(
    names.map(async (name) => {
      try {
        repositories.set(name, await client.getRepository(name));
      } catch {
        // Keep the digest useful even when a deleted or private repo cannot be enriched.
      }
    }),
  );

  return repositories;
}

async function fetchFollowees(client: GitHubClient): Promise<Set<string>> {
  try {
    return await client.getFollowing();
  } catch {
    return new Set<string>();
  }
}

async function enrichPullRequests(client: GitHubClient, events: ActivityCard[]): Promise<void> {
  const pullRequests = events
    .filter((event) => event.type === "pull_request" && event.prNumber)
    .slice(0, 20);

  await Promise.all(
    pullRequests.map(async (event) => {
      try {
        const pr = await client.getPullRequest(event.repo, event.prNumber ?? 0);
        event.title = pr.title;
        event.htmlUrl = pr.htmlUrl;
        if (pr.body) event.summary = pr.body;
      } catch {
        // Missing PR details should not block the whole daily digest.
      }
    }),
  );
}
