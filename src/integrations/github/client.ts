import { Effect } from "effect";
import { HttpClient } from "effect/http";

import type { PaginationOptions } from "../../acquisition/index.js";

import { asError, provideHttp } from "../shared/http.js";

export type GitHubRestOptions = {
  token?: string;
  fetch?: typeof fetch;
};

export const githubHeaders = (token: string | undefined): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rss-summary",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const apiOrigin = "https://api.github.com";

export function readJson(path: string, options: GitHubRestOptions): Effect.Effect<unknown, Error> {
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
