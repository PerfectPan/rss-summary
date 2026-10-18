import { Effect, Layer } from "effect";
import { HttpClient } from "effect/http";

import {
  followingLogins,
  pullRequestDetails,
  repositoryMetadata,
} from "../../domain/item/adapters/github-repository.js";
import { GitHubCatalog, type PaginationOptions } from "../../application/ports.js";
import { asError, githubHeaders, provideHttp } from "./http.js";

export type GitHubRestOptions = {
  token?: string;
  fetch?: typeof fetch;
};

const apiOrigin = "https://api.github.com";

function readJson(path: string, options: GitHubRestOptions): Effect.Effect<unknown, Error> {
  const headers = githubHeaders(options.token);
  return Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const response = yield* http
      .get(`${apiOrigin}${path}`, { headers })
      .pipe(Effect.mapError(asError));
    if (response.status < 200 || response.status >= 300) {
      const text = yield* response.text.pipe(Effect.mapError(asError));
      return yield* Effect.fail(
        new Error(`GitHub API ${response.status} for ${path}: ${text.slice(0, 300)}`),
      );
    }
    return yield* response.json.pipe(Effect.mapError(asError));
  }).pipe((effect) => provideHttp(effect, options.fetch ?? fetch));
}

/** Received-events pages are fetched concurrently, like the historical client. */
export function readReceivedEvents(
  username: string,
  pagination: PaginationOptions,
  options: GitHubRestOptions,
): Effect.Effect<unknown[], Error> {
  return Effect.map(
    Effect.forEach(
      Array.from({ length: pagination.pages }, (_, index) => index + 1),
      (page) =>
        readJson(
          `/users/${encodeURIComponent(username)}/received_events?per_page=${pagination.perPage}&page=${page}`,
          options,
        ),
      { concurrency: "unbounded" },
    ),
    (pages) => pages.flatMap((page) => (Array.isArray(page) ? page : [page])),
  );
}

export const GitHubCatalogLive = (options: GitHubRestOptions = {}): Layer.Layer<GitHubCatalog> =>
  Layer.succeed(GitHubCatalog, {
    getRepository: (fullName) =>
      Effect.map(readJson(`/repos/${fullName}`, options), (page) => repositoryMetadata(page)),
    getPullRequest: (fullName, number) =>
      Effect.map(readJson(`/repos/${fullName}/pulls/${number}`, options), (page) =>
        pullRequestDetails(page),
      ),
    getFollowing: (pagination?: PaginationOptions) =>
      Effect.map(
        Effect.forEach(
          Array.from({ length: pagination?.pages ?? 3 }, (_, index) => index + 1),
          (page) =>
            Effect.map(
              readJson(
                `/user/following?per_page=${pagination?.perPage ?? 100}&page=${page}`,
                options,
              ),
              followingLogins,
            ),
          { concurrency: "unbounded" },
        ),
        (pages) => new Set(pages.flatMap((logins) => [...logins])),
      ),
  });
