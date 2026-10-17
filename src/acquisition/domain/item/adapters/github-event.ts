import { Schema } from "effect";

import { ok, type Result } from "../../../../kernel/result.js";
import type { Item, ItemKind, SignalType } from "../item.js";
import type { ActivityCardDto, ActivityType } from "./activity-card.js";
import { decodeSchema, type DecodeFailure } from "./decode.js";

const nullable = Schema.NullOr(Schema.Unknown);
const rawEventSchema = Schema.Struct({
  id: Schema.optional(nullable),
  type: Schema.optional(nullable),
  actor: Schema.optional(nullable),
  repo: Schema.optional(nullable),
  created_at: Schema.optional(nullable),
  payload: Schema.optional(nullable),
});

type RawEvent = {
  id?: unknown;
  type?: unknown;
  actor?: unknown;
  repo?: unknown;
  created_at?: unknown;
  payload?: unknown;
};

export type GitHubAcquired = {
  item: Item;
  card: ActivityCardDto;
};

export function decodeGitHubEvent(input: unknown): Result<GitHubAcquired, DecodeFailure> {
  const decoded = decodeSchema(rawEventSchema, input);
  if (decoded._tag === "Err") return decoded;
  const card = cardFromRaw(decoded.value);
  return ok({ card, item: itemFromGitHubCard(card) });
}

/** Preserves the historical soft cast: a payload that fails decoding becomes an empty card. */
export function normalizeEvent(input: unknown): ActivityCardDto {
  const decoded = decodeGitHubEvent(input);
  if (decoded._tag === "Err") return cardFromRaw({});
  return decoded.value.card;
}

export function acquireGitHubEvent(input: unknown): GitHubAcquired {
  const decoded = decodeGitHubEvent(input);
  if (decoded._tag === "Err") {
    const card = cardFromRaw({});
    return { card, item: itemFromGitHubCard(card) };
  }
  return decoded.value;
}

function cardFromRaw(raw: RawEvent): ActivityCardDto {
  const githubType = asString(raw.type);
  const payload = asRecord(raw.payload);
  const repo = asString(asRecord(raw.repo).name);
  const base = {
    id: asString(raw.id),
    actor: asString(asRecord(raw.actor).login),
    repo,
    createdAt: asString(raw.created_at),
    action: optionalString(payload.action),
  };

  if (githubType === "WatchEvent") {
    return { ...base, type: "watch" };
  }

  if (githubType === "PullRequestEvent") {
    const pullRequest = asRecord(payload.pull_request);
    return {
      ...base,
      type: "pull_request",
      prNumber: optionalNumber(payload.number),
      detailUrl: optionalString(pullRequest.url),
      htmlUrl: optionalString(pullRequest.html_url),
      title: optionalString(pullRequest.title),
      summary: optionalString(pullRequest.body),
    };
  }

  if (githubType === "ReleaseEvent") {
    const release = asRecord(payload.release);
    return {
      ...base,
      type: "release",
      detailUrl: optionalString(release.url),
      htmlUrl: optionalString(release.html_url),
      title: optionalString(release.name) ?? optionalString(release.tag_name),
      summary: optionalString(release.body),
    };
  }

  if (githubType === "ForkEvent") {
    return { ...base, type: "fork" };
  }

  if (githubType === "CreateEvent") {
    if (payload.ref_type !== "repository") {
      return { ...base, type: "other" };
    }
    return { ...base, type: "create" };
  }

  return { ...base, type: "other" };
}

export function itemFromGitHubCard(card: ActivityCardDto): Item {
  const signal = signalFor(card);
  const reference = card.htmlUrl;
  return {
    id: card.id,
    kind: kindFor(card.type),
    subject: {
      key: subjectKey(card),
      name: card.repo || card.actor,
      ...(reference ? { url: reference } : {}),
    },
    content: {
      ...(card.title ? { title: card.title } : {}),
      ...(card.summary ? { excerpt: card.summary } : {}),
      ...(reference ? { url: reference } : {}),
    },
    publishedAt: { value: card.createdAt, precision: "instant" },
    provenance: {
      origin: reference || (card.repo ? `https://github.com/${card.repo}` : card.actor),
      ...(card.actor ? { actor: { name: card.actor, followed: false } } : {}),
    },
    credibility: { tier: "unrated" },
    signals: signal ? [signal] : [],
    display: {
      ...(displayLabel(card) ? { label: displayLabel(card) } : {}),
      ...(reference ? { reference } : {}),
      facts: [],
    },
  };
}

function signalFor(card: ActivityCardDto): { type: SignalType; label: string } | undefined {
  if (card.type === "watch") return { type: "endorsed", label: "followee starred this repository" };
  if (card.type === "trending")
    return { type: "recommended-trending", label: "GitHub Home trending repository" };
  if (card.type === "recommendation")
    return { type: "recommended-personal", label: "GitHub Home recommendation" };
  if (card.type === "announcement") return { type: "announced", label: "GitHub Home announcement" };
  if (card.type === "release") return { type: "released", label: "new release published" };
  if (card.type === "fork") return { type: "forked", label: "followed actor forked repository" };
  if (card.type === "create") return { type: "created", label: "new repository created" };
  if (card.type === "follow")
    return { type: "relationship", label: "follow relationship from GitHub Home" };
  if (card.type === "pull_request" && card.action === "merged") {
    return { type: "change-merged", label: "pull request merged" };
  }
  if (card.type === "pull_request" && card.action === "opened") {
    return { type: "change-opened", label: "pull request opened" };
  }
  if (card.type === "pull_request" && card.action === "closed") {
    return { type: "change-closed", label: "pull request closed" };
  }
  if (card.type === "pull_request") return { type: "change-other", label: "pull request" };
  return undefined;
}

function kindFor(type: ActivityType): ItemKind {
  if (type === "release") return "release";
  if (type === "pull_request") return "change";
  if (type === "announcement") return "post";
  if (type === "article") return "publication";
  if (type === "paper") return "paper";
  return "project";
}

function subjectKey(card: ActivityCardDto): string {
  if (card.type === "pull_request") {
    return `github-pull-request:${card.repo}:${card.prNumber ?? card.id}`;
  }
  if (card.type === "release") return `github-release:${card.htmlUrl ?? card.id}`;
  return `github-repository:${card.repo}`;
}

function displayLabel(card: ActivityCardDto): string | undefined {
  if (card.type !== "pull_request") return card.title;
  const number = card.prNumber ? ` #${card.prNumber}` : "";
  const title = card.title ? ` · ${card.title}` : "";
  return `${card.repo}${number}${title}`;
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

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
