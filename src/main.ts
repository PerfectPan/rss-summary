import { loadConfig } from "./config.js";
import { buildCandidateProjects, normalizeEvent, type ActivityCard, type RepositoryMetadata } from "./domain.js";
import { isWithinEventWindow, resolveEventWindow } from "./event-window.js";
import { GitHubClient } from "./github.js";
import { GitHubHomeClient } from "./github-home.js";
import { createNotifier } from "./notifier.js";
import { renderJsonDigest, renderMarkdownDigest } from "./render.js";
import { RssClient } from "./rss.js";
import { filterNewCandidates, loadFeedState, markCandidatesSeen, saveFeedState } from "./state.js";

export async function run(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient({ token: config.token });
  const rssClient = new RssClient();

  const [githubResult, rssResult] = await Promise.allSettled([
    config.rssOnly
      ? Promise.resolve([])
      : fetchGithubEvents(config, client),
    fetchRssEvents(rssClient, config.rssFeeds),
  ]);
  const githubEvents = githubResult.status === "fulfilled" ? githubResult.value : [];
  const rssEvents = rssResult.status === "fulfilled" ? rssResult.value : [];
  if (githubResult.status === "rejected") {
    console.error(`GitHub feed unavailable; continuing with RSS events: ${formatError(githubResult.reason)}`);
  }
  if (rssResult.status === "rejected") {
    console.error(`RSS feeds unavailable; continuing with GitHub events: ${formatError(rssResult.reason)}`);
  }
  const eventWindow = resolveEventWindow(config);
  const events = [...githubEvents, ...rssEvents].filter((event) => isWithinEventWindow(event, eventWindow));

  const followees = config.token && !config.rssOnly ? await client.getFollowing() : new Set<string>();
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
  const candidates = config.onlyNew ? filterNewCandidates(allCandidates, state) : allCandidates;

  const document = {
    generatedAt: new Date().toISOString(),
    username: config.username,
    sourceMode: config.rssOnly ? ("rss" as const) : ("mixed" as const),
    windowLabel: eventWindow.label,
    candidates,
  };
  const output = config.outputFormat === "json" ? renderJsonDigest(document) : renderMarkdownDigest(document);

  await createNotifier({ webhookUrl: config.webhookUrl }).send(output);

  if (config.onlyNew && !config.dryRun) {
    markCandidatesSeen(state, candidates, document.generatedAt);
    saveFeedState(config.stateFile, state);
  }
}

async function fetchGithubEvents(
  config: ReturnType<typeof loadConfig>,
  client: GitHubClient,
): Promise<ActivityCard[]> {
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const pullRequests = events.filter((event) => event.type === "pull_request" && event.prNumber && !event.title).slice(0, 20);

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

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
