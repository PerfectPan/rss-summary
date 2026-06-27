import { loadConfig } from "./config.js";
import { buildCandidateProjects, normalizeEvent, type ActivityCard, type RepositoryMetadata } from "./domain.js";
import { isWithinEventWindow, resolveEventWindow } from "./event-window.js";
import { GitHubClient } from "./github.js";
import { createNotifier } from "./notifier.js";
import { renderJsonDigest, renderMarkdownDigest } from "./render.js";
import { RssClient } from "./rss.js";
import { filterNewCandidates, loadFeedState, markCandidatesSeen, saveFeedState } from "./state.js";

export async function run(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient({ token: config.token });
  const rssClient = new RssClient();

  const [rawEvents, rssEvents] = await Promise.all([
    client.getReceivedEvents(config.username, {
      perPage: config.perPage,
      pages: config.eventPages,
    }),
    fetchRssEvents(rssClient, config.rssFeeds),
  ]);
  const eventWindow = resolveEventWindow(config);
  const events = [...rawEvents.map(normalizeEvent), ...rssEvents].filter((event) =>
    isWithinEventWindow(event, eventWindow),
  );

  const followees = config.token ? await client.getFollowing() : new Set<string>();
  const repositories = await fetchRepositoryMetadata(client, events, config.maxRepos);
  await enrichPullRequests(client, events);

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
