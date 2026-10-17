import { Schema } from "effect";

import { formatCompactCount } from "../../../../kernel/text.js";
import type { Item } from "../item.js";
import type { PullRequestDetails, RepositoryMetadata } from "./activity-card.js";
import { decodeSchema } from "./decode.js";

const nullable = Schema.NullOr(Schema.Unknown);
const repositorySchema = Schema.Struct({
  full_name: Schema.optional(nullable),
  html_url: Schema.optional(nullable),
  description: Schema.optional(nullable),
  language: Schema.optional(nullable),
  stargazers_count: Schema.optional(nullable),
  topics: Schema.optional(nullable),
  pushed_at: Schema.optional(nullable),
});

const pullRequestSchema = Schema.Struct({
  title: Schema.optional(nullable),
  html_url: Schema.optional(nullable),
  body: Schema.optional(nullable),
});

const accountSchema = Schema.Struct({
  login: Schema.optional(nullable),
});

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

export function repositoryMetadata(input: unknown): RepositoryMetadata {
  const decoded = decodeSchema(repositorySchema, input);
  const raw = decoded._tag === "Ok" ? decoded.value : asRecord(input);
  const topics = Array.isArray(raw.topics)
    ? raw.topics.filter((topic): topic is string => typeof topic === "string")
    : [];
  return {
    fullName: asNullableString(raw.full_name) ?? "",
    htmlUrl: asNullableString(raw.html_url) ?? "",
    description: stringOrNull(raw.description),
    language: stringOrNull(raw.language),
    stargazersCount: typeof raw.stargazers_count === "number" ? raw.stargazers_count : 0,
    topics,
    pushedAt: stringOrNull(raw.pushed_at),
  };
}

export function acquirePullRequest(
  input: unknown,
  fullName: string,
  number: number,
): PullRequestAcquired {
  const details = pullRequestDetails(input);
  return { details, item: pullRequestItem(details, fullName, number) };
}

export function pullRequestDetails(input: unknown): PullRequestDetails {
  const decoded = decodeSchema(pullRequestSchema, input);
  const raw = decoded._tag === "Ok" ? decoded.value : asRecord(input);
  return {
    title: asNullableString(raw.title) ?? "",
    htmlUrl: asNullableString(raw.html_url) ?? "",
    body: stringOrNull(raw.body),
  };
}

export function acquireFollowing(input: unknown): { logins: string[]; items: Item[] } {
  const logins = followingLogins(input);
  return { logins, items: logins.map(followedAccount) };
}

export function followingLogins(input: unknown): string[] {
  const decoded = decodeSchema(Schema.Array(accountSchema), input);
  const rows =
    decoded._tag === "Ok" ? decoded.value : Array.isArray(input) ? input.map(asRecord) : [];
  return rows
    .map((row) => asRecord(row).login)
    .filter((login): login is string => typeof login === "string" && Boolean(login));
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
    signals: [{ type: "pull-request", label: "pull request" }],
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
    signals: [{ type: "follow", label: "follow relationship from GitHub Home" }],
    display: { label: login, reference: url, facts: [] },
  };
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function asNullableString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

const objectCtorString = Function.prototype.toString.call(Object);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto: object | null = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return (
    typeof ctor === "function" &&
    ctor instanceof ctor &&
    Function.prototype.toString.call(ctor) === objectCtorString
  );
}
