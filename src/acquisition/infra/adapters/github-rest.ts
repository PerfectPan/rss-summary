import { Effect } from "effect";
import { HttpClient } from "effect/http";

import type {
  PullRequestDetails,
  RepositoryMetadata,
} from "../../domain/item/adapters/activity-card.js";
import {
  followingLogins,
  pullRequestDetails,
  repositoryMetadata,
} from "../../domain/item/adapters/github-repository.js";
import { asError, githubHeaders, provideHttp } from "./http.js";

export type GitHubClientOptions = {
  token?: string;
  fetch?: typeof fetch;
};

export type PaginationOptions = {
  perPage: number;
  pages: number;
};

const apiOrigin = "https://api.github.com";

export class GitHubClient {
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getReceivedEvents(username: string, pagination: PaginationOptions): Promise<unknown[]> {
    const pages = await Promise.all(
      Array.from({ length: pagination.pages }, (_, index) =>
        this.getJson<unknown[]>(
          `/users/${encodeURIComponent(username)}/received_events?per_page=${pagination.perPage}&page=${index + 1}`,
        ),
      ),
    );
    return pages.flat();
  }

  async getFollowing(
    pagination: PaginationOptions = { perPage: 100, pages: 3 },
  ): Promise<Set<string>> {
    const pages = await Promise.all(
      Array.from({ length: pagination.pages }, (_, index) =>
        this.getJson<unknown>(`/user/following?per_page=${pagination.perPage}&page=${index + 1}`),
      ),
    );
    return new Set(pages.flatMap((page) => followingLogins(page)));
  }

  async getRepository(fullName: string): Promise<RepositoryMetadata> {
    return repositoryMetadata(await this.getJson<unknown>(`/repos/${fullName}`));
  }

  async getPullRequest(fullName: string, number: number): Promise<PullRequestDetails> {
    return pullRequestDetails(await this.getJson<unknown>(`/repos/${fullName}/pulls/${number}`));
  }

  private async getJson<T>(path: string): Promise<T> {
    return Effect.runPromise(this.readJson<T>(path));
  }

  private readJson<T>(path: string): Effect.Effect<T, Error> {
    const headers = githubHeaders(this.token);
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
      return (yield* response.json.pipe(Effect.mapError(asError))) as T;
    }).pipe((effect) => provideHttp(effect, this.fetchImpl));
  }
}
