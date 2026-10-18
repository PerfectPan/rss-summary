import { Effect, Layer } from "effect";

import { GitHubCatalog, type PaginationOptions } from "../../acquisition/index.js";

import { readJson, type GitHubRestOptions } from "./client.js";
import { followingLogins, pullRequestDetails, repositoryMetadata } from "./repository/dto.js";

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
