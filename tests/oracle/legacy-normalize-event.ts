import type { ActivityCardDto as ActivityCard } from "../../src/acquisition/index.js";
import { asRecord } from "../../src/domain/record.js";

type RawEvent = {
  id?: unknown;
  type?: unknown;
  actor?: { login?: unknown };
  repo?: { name?: unknown };
  created_at?: unknown;
  payload?: Record<string, unknown>;
};

export function normalizeEvent(input: unknown): ActivityCard {
  const raw = asRecord(input) as RawEvent;
  const githubType = asString(raw.type);
  const payload = raw.payload ?? {};
  const repo = asString(raw.repo?.name);

  const base = {
    id: asString(raw.id),
    actor: asString(raw.actor?.login),
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
