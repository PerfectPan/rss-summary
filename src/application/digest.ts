import { Effect } from "effect";

import {
  buildCandidateProjects,
  normalizeEvent,
  type ActivityCard,
  type DigestDocument,
  type RepositoryMetadata,
} from "../domain/digest.js";
import { isWithinEventWindow, resolveEventWindow } from "../domain/time.js";
import { loadConfig, type AppConfig } from "../infrastructure/config.js";
import { GitHubClient } from "../infrastructure/github.js";
import { GitHubHomeClient } from "../infrastructure/github-home.js";
import { createNotifier } from "../infrastructure/notifier.js";
import { RssClient } from "../infrastructure/rss.js";
import {
  filterNewCandidates,
  filterUnresearchedCandidates,
  loadFeedState,
  markCandidatesSeen,
  saveFeedState,
  type FeedState,
} from "../infrastructure/state.js";
import { attempt } from "./effect.js";
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
    const { document, state } = yield* attempt(collectDigest(config));
    const output = render(document, config.outputFormat);

    yield* attempt(createNotifier({ webhookUrl: config.webhookUrl }).send(output));

    if (config.onlyNew && !config.dryRun) {
      markCandidatesSeen(state, document.candidates, document.generatedAt);
      saveFeedState(config.stateFile, state);
    }
  });
}

export function buildDigestDocument(config: AppConfig): Effect.Effect<DigestDocument, Error> {
  return Effect.map(attempt(collectDigest(config)), ({ document }) => document);
}

async function collectDigest(
  config: AppConfig,
): Promise<{ document: DigestDocument; state: FeedState }> {
  const client = new GitHubClient({ token: config.token });
  const rssClient = new RssClient();

  const [githubResult, rssResult] = await Promise.allSettled([
    config.rssOnly ? Promise.resolve([]) : fetchGithubEvents(config, client),
    fetchRssEvents(rssClient, config.rssFeeds),
  ]);
  const githubEvents = githubResult.status === "fulfilled" ? githubResult.value : [];
  const rssEvents = rssResult.status === "fulfilled" ? rssResult.value : [];
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
    config.token && !config.rssOnly ? await client.getFollowing() : new Set<string>();
  const repositories = config.rssOnly
    ? new Map<string, RepositoryMetadata>()
    : await fetchRepositoryMetadata(client, events, config.maxRepos);
  if (!config.rssOnly) {
    await enrichPullRequests(client, events);
  }

  const allCandidates = buildCandidateProjects(events, {
    followees,
    interests: config.interests,
    repositories,
  });
  const state = loadFeedState(config.stateFile);
  const candidates = config.onlyNew
    ? filterUnresearchedCandidates(filterNewCandidates(allCandidates, state), state)
    : allCandidates;

  const document: DigestDocument = {
    generatedAt: new Date().toISOString(),
    username: config.username,
    sourceMode: config.rssOnly ? "rss" : "mixed",
    windowLabel: eventWindow.label,
    candidates,
  };
  return { document, state };
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

async function fetchRssEvents(
  client: RssClient,
  feeds: Array<{ name: string; url: string; tags: string[] }>,
): Promise<ActivityCard[]> {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        return await client.getFeedEvents(feed);
      } catch {
        // A broken feed should not block GitHub summaries or other RSS sources.
        return [];
      }
    }),
  );

  return results.flat();
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

async function enrichPullRequests(client: GitHubClient, events: ActivityCard[]): Promise<void> {
  const pullRequests = events
    .filter((event) => event.type === "pull_request" && event.prNumber && !event.title)
    .slice(0, 20);

  await Promise.all(
    pullRequests.map(async (event) => {
      try {
        const pr = await client.getPullRequest(event.repo, event.prNumber ?? 0);
        event.title = pr.title;
        event.htmlUrl = pr.htmlUrl;
        event.summary = pr.body ?? undefined;
      } catch {
        // Missing PR details should not block the whole daily digest.
      }
    }),
  );
}
