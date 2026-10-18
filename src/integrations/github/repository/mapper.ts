import { formatCompactCount } from "../../../kernel/text.js";
import type { Item, PullRequestDetails, RepositoryMetadata } from "../../../acquisition/index.js";

import { followingLogins, pullRequestDetails, repositoryMetadata } from "./dto.js";

export type RepositoryAcquired = {
  metadata: RepositoryMetadata;
  item: Item;
};

export type PullRequestAcquired = {
  details: PullRequestDetails;
  item: Item;
};

export function acquireRepository(input: unknown): RepositoryAcquired {
  const metadata = repositoryMetadata(input);
  return { metadata, item: repositoryItem(metadata) };
}

export function acquirePullRequest(
  input: unknown,
  fullName: string,
  number: number,
): PullRequestAcquired {
  const details = pullRequestDetails(input);
  return { details, item: pullRequestItem(details, fullName, number) };
}

export function acquireFollowing(input: unknown): { logins: string[]; items: Item[] } {
  const logins = followingLogins(input);
  return { logins, items: logins.map(followedAccount) };
}

function repositoryItem(metadata: RepositoryMetadata): Item {
  const keywords = [...metadata.topics, ...(metadata.language ? [metadata.language] : [])];
  return {
    id: `repository:${metadata.fullName}`,
    kind: "project",
    subject: {
      key: `github-repository:${metadata.fullName}`,
      name: metadata.fullName,
      ...(metadata.htmlUrl ? { url: metadata.htmlUrl } : {}),
      profile: {
        ...(metadata.description ? { description: metadata.description } : {}),
        keywords,
        popularity: metadata.stargazersCount,
        ...(metadata.pushedAt ? { lastActiveAt: metadata.pushedAt } : {}),
      },
    },
    content: {
      ...(metadata.description ? { excerpt: metadata.description } : {}),
      ...(metadata.htmlUrl ? { url: metadata.htmlUrl } : {}),
    },
    publishedAt: { value: metadata.pushedAt ?? "", precision: "instant" },
    provenance: { origin: metadata.htmlUrl || metadata.fullName },
    credibility: { tier: "official", method: "configured-domain" },
    signals: [],
    display: {
      ...(metadata.fullName ? { label: metadata.fullName } : {}),
      ...(metadata.htmlUrl ? { reference: metadata.htmlUrl } : {}),
      facts: [`⭐ ${formatCompactCount(metadata.stargazersCount)}`],
    },
  };
}

function pullRequestItem(details: PullRequestDetails, fullName: string, number: number): Item {
  return {
    id: `pull-request:${fullName}:${number}`,
    kind: "change",
    subject: {
      key: `github-pull-request:${fullName}:${number}`,
      name: fullName,
      ...(details.htmlUrl ? { url: details.htmlUrl } : {}),
    },
    content: {
      ...(details.title ? { title: details.title } : {}),
      ...(details.body ? { excerpt: details.body } : {}),
      ...(details.htmlUrl ? { url: details.htmlUrl } : {}),
    },
    publishedAt: { value: "", precision: "instant" },
    provenance: { origin: details.htmlUrl || fullName },
    credibility: { tier: "unrated" },
    signals: [{ type: "change-other", label: "pull request" }],
    display: {
      label: `${fullName} #${number}${details.title ? ` · ${details.title}` : ""}`,
      ...(details.htmlUrl ? { reference: details.htmlUrl } : {}),
      facts: [],
    },
  };
}

function followedAccount(login: string): Item {
  const url = `https://github.com/${login}`;
  return {
    id: `follow:${login}`,
    kind: "project",
    subject: { key: `account:${login}`, name: login, url },
    content: { url },
    publishedAt: { value: "", precision: "instant" },
    provenance: { origin: url, actor: { name: login, followed: true } },
    credibility: { tier: "unrated" },
    signals: [{ type: "relationship", label: "follow relationship from GitHub Home" }],
    display: { label: login, reference: url, facts: [] },
  };
}
