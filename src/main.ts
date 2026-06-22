import { loadConfig } from "./config.js";
import { buildCandidateProjects, normalizeEvent, type ActivityCard, type RepositoryMetadata } from "./domain.js";
import { GitHubClient } from "./github.js";
import { createNotifier } from "./notifier.js";
import { renderMarkdownDigest } from "./render.js";

export async function run(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient({ token: config.token });

  const rawEvents = await client.getReceivedEvents(config.username, {
    perPage: config.perPage,
    pages: config.eventPages,
  });
  const since = Date.now() - config.windowHours * 60 * 60 * 1000;
  const events = rawEvents.map(normalizeEvent).filter((event) => new Date(event.createdAt).getTime() >= since);

  const followees = config.token ? await client.getFollowing() : new Set<string>();
  const repositories = await fetchRepositoryMetadata(client, events, config.maxRepos);
  await enrichPullRequests(client, events);

  const candidates = buildCandidateProjects(events, {
    followees,
    interests: config.interests,
    repositories,
  });

  const markdown = renderMarkdownDigest({
    generatedAt: new Date().toISOString(),
    username: config.username,
    candidates,
  });

  await createNotifier({ webhookUrl: config.webhookUrl }).send(markdown);
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
