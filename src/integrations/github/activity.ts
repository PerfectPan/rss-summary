import { Effect, Layer } from "effect";

import { GitHubActivity } from "../../acquisition/index.js";

import { acquireActivityCard } from "../shared/scoring-trace.js";
import { acquireGitHubEvent } from "./event/mapper.js";
import { readHomeEvents, type GithubHomeClientOptions } from "./home-browser.js";
import { readReceivedEvents, type GitHubRestOptions } from "./client.js";

/** The GitHubActivity port: Home feed first, received-events as the fallback source. */
export const GitHubActivityLive = (options: {
  token?: string;
  fetch?: typeof fetch;
  githubHome?: GithubHomeClientOptions;
}): Layer.Layer<GitHubActivity> =>
  Layer.succeed(GitHubActivity, {
    getHomeEvents: () => {
      if (!options.githubHome) {
        return Effect.fail(
          new Error(
            "GitHub Home storage state not found: . Run 'rss-summary github-home login' first.",
          ),
        );
      }
      return Effect.map(readHomeEvents(options.githubHome), (events) =>
        events.map((card) => acquireActivityCard(card)),
      );
    },
    getReceivedEvents: (username, pagination) =>
      Effect.map(readReceivedEvents(username, pagination, options), (events) =>
        events.map((event) => acquireActivityCard(acquireGitHubEvent(event).card)),
      ),
  });

export type { GitHubRestOptions, GithubHomeClientOptions };
