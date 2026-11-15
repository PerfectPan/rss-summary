import { randomUUID } from "node:crypto";

import { Effect } from "effect";

import {
  GitHubActivity,
  GitHubCatalog,
  collectRssFeeds,
  RssFeed,
  type Acquired,
  type ActivityCardDto,
  type RepositoryMetadata
} from "../../../acquisition/index.js";
import { type CandidateProject } from "../../../editorial/index.js";
import type { DigestDocument } from "./output.js";
import { errorMessage, isWithinEventWindow, resolveEventWindow } from "../../../kernel/index.js";
import {
  FeedStateStore,
  filterUndelivered,
  loadFeedState,
  type FeedState,
  type RunAudit,
  type RunSourceResult
} from "../../../delivery/index.js";
import type { AppConfig } from "../../config/env.js";
import type { AppServices } from "../../layers.js";
import { runProductFlow } from "../shared/flow.js";
import {
  auditReasonWhenFiltered,
  runAuditCounts,
  runAuditDecisions,
  scoreAcquiredCandidates
} from "../shared/candidates.js";

export type { DigestDocument };

type DigestServices = GitHubActivity | GitHubCatalog | RssFeed | FeedStateStore;

function deliveredEventIds(candidate: CandidateProject): string[] {
  return candidate.events.map((event) => event.id);
}

function fetchGithubEvents(config: AppConfig): Effect.Effect<Acquired[], Error, GitHubActivity> {
  return Effect.gen(function* () {
    const github = yield* GitHubActivity;
    if (config.githubFeedSource === "home") {
      return yield* github.getHomeEvents();
    }
    return yield* github.getReceivedEvents(config.username, {
      perPage: config.perPage,
      pages: config.eventPages
    });
  });
}

function fetchRepositoryMetadata(
  events: ActivityCardDto[],
  maxRepos: number
): Effect.Effect<Map<string, RepositoryMetadata>, Error, GitHubCatalog> {
  const names = [
    ...new Set(
      events
        .filter((event) => event.type !== "other")
        .filter((event) => event.source !== "rss")
        .map((event) => event.repo)
        .filter(Boolean)
    )
  ].slice(0, maxRepos);

  return Effect.gen(function* () {
    const catalog = yield* GitHubCatalog;
    const repositories = new Map<string, RepositoryMetadata>();
    yield* Effect.forEach(
      names,
      (name) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(catalog.getRepository(name));
          if (result._tag === "Success") {
            repositories.set(name, result.success);
          }
        }),
      { concurrency: "unbounded" }
    );
    return repositories;
  });
}

function fetchFollowees(): Effect.Effect<Set<string>, Error, GitHubCatalog> {
  return Effect.gen(function* () {
    const catalog = yield* GitHubCatalog;
    const followed = yield* catalog.getFollowing();
    return new Set(followed);
  });
}

function enrichPullRequests(events: ActivityCardDto[]): Effect.Effect<void, Error, GitHubCatalog> {
  const pullRequests = events.filter((event) => event.type === "pull_request" && event.prNumber).slice(0, 20);

  return Effect.gen(function* () {
    const catalog = yield* GitHubCatalog;
    yield* Effect.forEach(
      pullRequests,
      (event) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(catalog.getPullRequest(event.repo, event.prNumber ?? 0));
          if (result._tag === "Failure") {
            return;
          }
          event.title = result.success.title;
          event.htmlUrl = result.success.htmlUrl;
          if (result.success.body) {
            event.summary = result.success.body;
          }
        }),
      { concurrency: "unbounded" }
    );
  });
}

function collectDigest(
  config: AppConfig
): Effect.Effect<{ audit: RunAudit; document: DigestDocument; state: FeedState }, Error, DigestServices> {
  return Effect.gen(function* () {
    const [githubResult, rssResult] = yield* Effect.all(
      [
        Effect.result(config.rssOnly ? Effect.succeed<Acquired[]>([]) : fetchGithubEvents(config)),
        Effect.result(collectRssFeeds(config.rssFeeds))
      ] as const,
      { concurrency: "unbounded" }
    );
    const githubEvents = githubResult._tag === "Success" ? githubResult.success : [];
    const rssCollection = rssResult._tag === "Success" ? rssResult.success : { acquired: [], sources: [] };
    const rssEvents = rssCollection.acquired;
    if (githubResult._tag === "Failure") {
      console.error(`GitHub feed unavailable; continuing with RSS events: ${errorMessage(githubResult.failure)}`);
    }
    if (rssResult._tag === "Failure") {
      console.error(`RSS feeds unavailable; continuing with GitHub events: ${errorMessage(rssResult.failure)}`);
    }

    const followees =
      config.token && !config.rssOnly
        ? yield* Effect.map(Effect.result(fetchFollowees()), (outcome) =>
            outcome._tag === "Success" ? outcome.success : new Set<string>()
          )
        : new Set<string>();
    const githubCards = githubEvents.map((entry) => entry.card);
    const repositories = config.rssOnly
      ? new Map<string, RepositoryMetadata>()
      : yield* fetchRepositoryMetadata(githubCards, config.maxRepos);
    if (!config.rssOnly) {
      yield* enrichPullRequests(githubCards);
    }

    return yield* Effect.try({
      try: () => {
        const eventWindow = resolveEventWindow(config);
        const acquired = [...githubEvents, ...rssEvents].filter((entry) =>
          isWithinEventWindow(entry.card, eventWindow)
        );
        const events = acquired.map((entry) => entry.card);

        const { rankedCandidates, allCandidates } = scoreAcquiredCandidates(
          acquired,
          { followees, repositories },
          config
        );
        const state = loadFeedState(config.stateFile);
        const candidates = config.onlyNew ? filterUndelivered(allCandidates, deliveredEventIds, state) : allCandidates;

        const generatedAt = new Date().toISOString();
        const document: DigestDocument = {
          generatedAt,
          username: config.username,
          sourceMode: config.rssOnly ? "rss" : "mixed",
          windowLabel: eventWindow.label,
          candidates
        };
        const githubSource: RunSourceResult = {
          id: config.githubFeedSource,
          kind: config.githubFeedSource === "home" ? "github-home" : "github-events",
          name: config.githubFeedSource === "home" ? "GitHub Home" : "GitHub received events",
          status: config.rssOnly ? "skipped" : githubResult._tag === "Success" ? "ok" : "failed",
          itemCount: githubEvents.length,
          ...(githubResult._tag === "Failure" ? { error: errorMessage(githubResult.failure) } : {})
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
          counts: runAuditCounts({
            fetched: githubEvents.length + rssEvents.length,
            inWindow: events.length,
            ranked: rankedCandidates.length,
            candidates
          }),
          candidates: runAuditDecisions(
            rankedCandidates,
            candidates,
            auditReasonWhenFiltered(researchSet, (value) => {
              if (config.onlyNew && !selectedSet.has(value)) {
                return "all events were already delivered";
              }
              return undefined;
            }),
            { semanticSummaries: true }
          )
        };
        document.audit = audit;
        return { audit, document, state };
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    });
  });
}

/** Subscription digest workflow. The CLI injects `render` for the output format. */
export function runSubscriptionFlow(
  config: AppConfig,
  render: (document: DigestDocument, format: AppConfig["outputFormat"]) => string
): Effect.Effect<void, Error, AppServices> {
  return runProductFlow(config, collectDigest(config), config.stateFile, deliveredEventIds, render);
}

export function buildDigestDocument(config: AppConfig): Effect.Effect<DigestDocument, Error, AppServices> {
  return Effect.map(collectDigest(config), ({ document }) => document);
}
