import { Schema } from "effect";

import type { ActivityCardDto } from "../../../acquisition/index.js";

import { ok, type Result } from "../../../kernel/result.js";
import { decodeSchema, type DecodeFailure } from "../../shared/decode.js";

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

export type DecodedEvent = ActivityCardDto;

export function decodeEventCard(input: unknown): Result<DecodedEvent, DecodeFailure> {
  const decoded = decodeSchema(rawEventSchema, input);
  if (decoded._tag === "Err") return decoded;
  return ok(cardFromRaw(decoded.value));
}

/** Preserves the historical soft cast: a payload that fails decoding becomes an empty card. */
export function normalizeEvent(input: unknown): ActivityCardDto {
  const decoded = decodeEventCard(input);
  if (decoded._tag === "Err") return cardFromRaw({});
  return decoded.value;
}

export function cardFromRaw(raw: RawEvent): ActivityCardDto {
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
