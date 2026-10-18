import { Effect } from "effect";

import type { RunAudit } from "../../../delivery/index.js";
import type { DigestDocument } from "./output.js";
import { calendarDayAtOffset, shiftCalendarDay } from "../../../kernel/index.js";
import { runPluginEffect } from "../../runtime.js";
import { loadEnvConfig, type AppConfig } from "../../config/env.js";
import { buildDigestDocument } from "./flow.js";
import type { RivusToolDescriptor } from "@rivus/agent";

import { createRivusSubscriptionExecutor } from "../../rivus/phases.js";
import { digestView } from "../../render/layouts/digest.js";
import { renderViewMarkdown } from "../../render/markdown.js";

export const RSS_SUMMARY_TOOL_ID = "rss-summary/generate-digest";

export type RivusDigestInput = {
  day?: string;
  occurrence?: string;
  onlyNew?: boolean;
  rssOnly?: boolean;
  window?: "previous-calendar-day";
};

export type RivusDigestResult = {
  candidateCount: number;
  generatedAt: string;
  markdown: string;
  paperCandidateCount: number;
  windowLabel?: string;
  audit?: RunAudit;
};

type RivusDigestDependencies = {
  buildDigestDocument?: (config: AppConfig) => Effect.Effect<DigestDocument, Error>;
  env?: NodeJS.ProcessEnv;
};

export type CollectedRivusDigest = {
  day?: string;
  document: DigestDocument;
};

export async function generateRivusDigest(
  value: unknown,
  dependencies: RivusDigestDependencies = {},
): Promise<RivusDigestResult> {
  const { day, document } = await collectRivusDigest(value, dependencies);
  const paperCandidateCount = document.candidates.filter(
    (candidate) => candidate.category === "paper",
  ).length;
  return {
    candidateCount: document.candidates.length - paperCandidateCount,
    generatedAt: document.generatedAt,
    markdown: renderViewMarkdown(digestView(day ? { ...document, displayDate: day } : document)),
    paperCandidateCount,
    ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
    ...(document.audit ? { audit: document.audit } : {}),
  };
}

/**
 * Decode the Tool input into the digest request: dry-run is forced, onlyNew
 * defaults to true, and `previous-calendar-day` resolves from the occurrence's
 * local calendar day. No argv round-trip and no environment mutation.
 */
export async function collectRivusDigest(
  value: unknown,
  dependencies: RivusDigestDependencies = {},
): Promise<CollectedRivusDigest> {
  const input = parseInput(value);
  if (input.day && input.occurrence) {
    throw new Error("day and occurrence cannot be used together.");
  }

  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  if (input.window && !input.occurrence) {
    throw new Error("window requires occurrence.");
  }
  const occurrenceDay = input.occurrence
    ? calendarDayAtOffset(input.occurrence, timezoneOffset)
    : undefined;
  const day =
    input.day ??
    (input.window === "previous-calendar-day" && occurrenceDay
      ? shiftCalendarDay(occurrenceDay, -1)
      : occurrenceDay);
  if (day && !/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    throw new Error("day must use YYYY-MM-DD format.");
  }

  const base = await runPluginEffect(loadEnvConfig(env));
  const onlyNew = input.onlyNew ?? true;
  const rssOnly = input.rssOnly ?? (env.FEED_RSS_ONLY === "1" || env.FEED_RSS_ONLY === "true");
  const config: AppConfig = {
    ...base,
    timezoneOffset,
    day: day ?? base.day,
    dryRun: true,
    webhookUrl: undefined,
    onlyNew,
    ...(input.rssOnly !== undefined || rssOnly ? { rssOnly } : { rssOnly: false }),
  };
  const document = await runPluginEffect(
    (dependencies.buildDigestDocument ?? buildDigestDocument)(config),
  );
  return {
    ...(day ? { day } : {}),
    document,
  };
}

function parseInput(value: unknown): RivusDigestInput {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rivus digest input must be an object.");
  }

  const input = value as Record<string, unknown>;
  return {
    day: optionalString(input.day, "day"),
    occurrence: optionalString(input.occurrence, "occurrence"),
    onlyNew: optionalBoolean(input.onlyNew, "onlyNew"),
    rssOnly: optionalBoolean(input.rssOnly, "rssOnly"),
    window: optionalWindow(input.window),
  };
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function optionalWindow(value: unknown): "previous-calendar-day" | undefined {
  if (value === undefined) return undefined;
  if (value !== "previous-calendar-day") throw new Error("window must be previous-calendar-day.");
  return value;
}

export const subscriptionsToolDescriptor: Pick<
  RivusToolDescriptor,
  "description" | "digest" | "idempotency" | "inputSchema" | "risk" | "version"
> = {
  description:
    "Generate a read-only subscription brief from the user's GitHub Home and personal RSS sources",
  digest: "sha256:rss-summary-generate-digest-v2",

  idempotency: "none",
  inputSchema: {
    additionalProperties: false,
    properties: {
      draft: {
        description:
          "Grounded Array<{ref, summary}> produced only from selected evidence; required for render",
        items: {
          additionalProperties: false,
          properties: {
            ref: { minLength: 1, type: "string" },
            summary: { maxLength: 180, minLength: 8, type: "string" },
          },
          required: ["ref", "summary"],
          type: "object",
        },
        type: "array",
      },
      research: {
        description: "Article research results returned by rss-summary/research-article",
        items: {
          additionalProperties: false,
          properties: {
            content: { maxLength: 16_000, type: "string" },
            error: { type: "string" },
            fetchedUrl: { format: "uri", type: "string" },
            method: {
              enum: ["browser", "http", "glm", "captions", "transcription"],
              type: "string",
            },
            materials: {
              type: "object",
              additionalProperties: false,
              properties: {
                transcriptPath: { type: "string" },
                manifestPath: { type: "string" },
              },
              required: ["transcriptPath", "manifestPath"],
            },
            visuals: {
              type: "object",
              additionalProperties: false,
              properties: {
                status: { enum: ["analyzed", "partial", "unavailable"], type: "string" },
                reason: { type: "string" },
                frames: {
                  type: "array",
                  maxItems: 6,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      index: { type: "integer", minimum: 1, maximum: 6 },
                      timestampSeconds: { type: "number", minimum: 0 },
                      imagePath: { type: "string" },
                      ocrText: { type: "string", maxLength: 1000 },
                      visualText: { type: "string", maxLength: 500 },
                      visionModel: { type: "string", maxLength: 120 },
                    },
                    required: ["index", "timestampSeconds", "imagePath"],
                  },
                },
              },
              required: ["status", "frames"],
            },
            ref: { minLength: 1, type: "string" },
            retrievedAt: { format: "date-time", type: "string" },
            status: { enum: ["failed", "ok"], type: "string" },
            title: { type: "string" },
            tool: { const: "article-research", type: "string" },
            url: { format: "uri", type: "string" },
          },
          required: ["ref", "status", "url"],
          type: "object",
        },
        type: "array",
      },
      day: {
        description: "Local calendar day in YYYY-MM-DD format",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        type: "string",
      },
      occurrence: {
        description: "Scheduled occurrence as an ISO date-time",
        format: "date-time",
        type: "string",
      },
      onlyNew: { default: true, type: "boolean" },
      phase: { enum: ["collect", "select", "render"], type: "string" },
      rssOnly: { default: false, type: "boolean" },
      selection: {
        description:
          "AI second-pass Array<{ref, selected, reason}> produced only from collect evidence; required for render",
        items: {
          additionalProperties: false,
          properties: {
            reason: { maxLength: 240, minLength: 4, type: "string" },
            ref: { minLength: 1, type: "string" },
            selected: { type: "boolean" },
          },
          required: ["ref", "selected", "reason"],
          type: "object",
        },
        type: "array",
      },
      window: { enum: ["previous-calendar-day"], type: "string" },
    },
    type: "object",
  },
  risk: "observe",
  version: "1.1.0",
};

/** Default executor: the three-phase protocol over collect/generate. */
export function createSubscriptionsToolExecutor(
  dependencies: { generateDigest?: (input: unknown) => Promise<RivusDigestResult> } = {},
) {
  return createRivusSubscriptionExecutor(
    dependencies.generateDigest ? { generate: dependencies.generateDigest } : {},
  );
}
