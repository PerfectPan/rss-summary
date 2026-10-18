import { randomUUID } from "node:crypto";
import { Effect } from "effect";

import {
  applyScoringContext,
  AcquisitionLive,
  GitHubActivity,
  GitHubCatalog,
  collectRssFeeds,
  refreshRouting,
  type Acquired,
  type ActivityCardDto,
  type RepositoryMetadata,
} from "../acquisition/index.js";
import {
  candidateDecision,
  scoreAcquired,
  selectResearchCandidates,
  type CandidateProject,
  type DigestDocument,
} from "../editorial/index.js";
import { isWithinEventWindow, resolveEventWindow } from "../domain/time.js";
import type { RunAudit, RunSourceResult } from "../delivery/index.js";
import { loadConfig, type AppConfig } from "../infrastructure/config.js";
import {
  deliver,
  DeliveryLive,
  FeedStateStore,
  filterUndelivered,
  loadFeedState,
  markDelivered,
  type FeedState,
} from "../delivery/index.js";
import { attempt } from "./effect.js";
import { errorMessage } from "../kernel/index.js";

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
      Effect.runPromise(
        Effect.provide(
          deliver({
            runLogDir: config.runLogDir,
            audit,
            output,
            dryRun: config.dryRun,
            ...(config.onlyNew && !config.dryRun
              ? {
                  afterSend: FeedStateStore.use((store) =>
                    store.save(
                      config.stateFile,
                      markDelivered(
                        state,
                        deliveredCandidates.flatMap(deliveredEventIds),
                        document.generatedAt,
                      ),
                    ),
                  ),
                }
              : {}),
          }),
          DeliveryLive({ webhookUrl: config.webhookUrl }),
        ),
      ),
    );
  });
}

export function buildDigestDocument(config: AppConfig): Effect.Effect<DigestDocument, Error> {
  return Effect.map(attempt(collectDigest(config)), ({ document }) => document);
}

async function collectDigest(
  config: AppConfig,
): Promise<{ audit: RunAudit; document: DigestDocument; state: FeedState }> {
  const [githubResult, rssResult] = await Promise.allSettled([
    config.rssOnly ? Promise.resolve([]) : runAcquisition(config, fetchGithubEvents(config)),
    runAcquisition(config, collectRssFeeds(config.rssFeeds)),
  ]);
  const githubEvents = githubResult.status === "fulfilled" ? githubResult.value : [];
  const rssCollection =
    rssResult.status === "fulfilled" ? rssResult.value : { acquired: [], sources: [] };
  const rssEvents = rssCollection.acquired;
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
  const acquired = [...githubEvents, ...rssEvents].filter((entry) =>
    isWithinEventWindow(entry.card, eventWindow),
  );
  const events = acquired.map((entry) => entry.card);

  const followees =
    config.token && !config.rssOnly ? await fetchFollowees(config) : new Set<string>();
  const repositories = config.rssOnly
    ? new Map<string, RepositoryMetadata>()
    : await fetchRepositoryMetadata(config, events, config.maxRepos);
  if (!config.rssOnly) {
    await enrichPullRequests(config, events);
  }

  const rankedCandidates = scoreAcquired(
    acquired.map((entry) =>
      applyScoringContext(refreshRouting(entry), { followees, repositories }),
    ),
    { interests: config.interests, now: Date.now() },
  );
  const allCandidates = selectResearchCandidates(rankedCandidates, config.maxPapers);
  const state = loadFeedState(config.stateFile);
  const candidates = config.onlyNew
    ? filterUndelivered(allCandidates, deliveredEventIds, state)
    : allCandidates;

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

function deliveredEventIds(candidate: CandidateProject): string[] {
  return candidate.events.map((event) => event.id);
}

function acquisition(config: AppConfig) {
  return AcquisitionLive({
    token: config.token,
    githubHome: {
      storageState: config.githubHomeStorageState,
      fetchMode: config.githubHomeFetch,
      browserChannel: process.env.GITHUB_HOME_BROWSER_CHANNEL,
    },
  });
}

function runAcquisition<A, E, R>(config: AppConfig, effect: Effect.Effect<A, E, R>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, acquisition(config)) as Effect.Effect<A, E>);
}

function fetchGithubEvents(config: AppConfig): Effect.Effect<Acquired[], Error, GitHubActivity> {
  return Effect.gen(function* () {
    const github = yield* GitHubActivity;
    if (config.githubFeedSource === "home") return yield* github.getHomeEvents();
    return yield* github.getReceivedEvents(config.username, {
      perPage: config.perPage,
      pages: config.eventPages,
    });
  });
}

function fetchRepositoryMetadata(
  config: AppConfig,
  events: ActivityCardDto[],
  maxRepos: number,
): Promise<Map<string, RepositoryMetadata>> {
  const names = [
    ...new Set(
      events
        .filter((event) => event.type !== "other")
        .filter((event) => event.source !== "rss")
        .map((event) => event.repo)
        .filter(Boolean),
    ),
  ].slice(0, maxRepos);

  return runAcquisition(
    config,
    Effect.gen(function* () {
      const catalog = yield* GitHubCatalog;
      const repositories = new Map<string, RepositoryMetadata>();
      yield* Effect.forEach(
        names,
        (name) =>
          Effect.gen(function* () {
            const result = yield* Effect.result(catalog.getRepository(name));
            if (result._tag === "Success") repositories.set(name, result.success);
          }),
        { concurrency: "unbounded" },
      );
      return repositories;
    }),
  );
}

async function fetchFollowees(config: AppConfig): Promise<Set<string>> {
  try {
    const followed = await runAcquisition(
      config,
      Effect.gen(function* () {
        const catalog = yield* GitHubCatalog;
        return yield* catalog.getFollowing();
      }),
    );
    return new Set(followed);
  } catch {
    return new Set<string>();
  }
}

async function enrichPullRequests(config: AppConfig, events: ActivityCardDto[]): Promise<void> {
  const pullRequests = events
    .filter((event) => event.type === "pull_request" && event.prNumber)
    .slice(0, 20);

  await runAcquisition(
    config,
    Effect.gen(function* () {
      const catalog = yield* GitHubCatalog;
      yield* Effect.forEach(
        pullRequests,
        (event) =>
          Effect.gen(function* () {
            const result = yield* Effect.result(
              catalog.getPullRequest(event.repo, event.prNumber ?? 0),
            );
            if (result._tag === "Failure") return;
            event.title = result.success.title;
            event.htmlUrl = result.success.htmlUrl;
            if (result.success.body) event.summary = result.success.body;
          }),
        { concurrency: "unbounded" },
      );
    }),
  );
}
