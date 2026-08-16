import {
  buildSubscriptionEditorial,
  buildSubscriptionEvidence,
  type SubscriptionEvidence,
} from "../domain/subscription-editorial.js";
import type { RunAudit } from "../domain/run-audit.js";
import {
  collectRivusDigest,
  generateRivusDigest,
  type CollectedRivusDigest,
  type RivusDigestResult,
} from "./rivus-digest.js";
import { renderMarkdownDigest } from "./render.js";

export type RivusSubscriptionToolResult =
  | {
      day?: string;
      editorialContract: {
        outputShape: "Array<{ref, summary}>";
        summaryLength: "one-to-two Chinese sentences, at most 180 characters";
        summaryPolicy: "write summaries only for evidence with summaryPolicy=required";
      };
      evidence: SubscriptionEvidence[];
      generatedAt: string;
      phase: "collect";
    }
  | (RivusDigestResult & { phase: "render" });

type SubscriptionToolDependencies = {
  collect?: (value: unknown) => Promise<CollectedRivusDigest>;
  generate?: (value: unknown) => Promise<RivusDigestResult>;
};

/** Two-phase Tool executor: collect grounded evidence, then validate and render model copy. */
export function createRivusSubscriptionExecutor(
  dependencies: SubscriptionToolDependencies = {},
): (value: unknown) => Promise<RivusSubscriptionToolResult | RivusDigestResult> {
  const collect = dependencies.collect ?? collectRivusDigest;
  const generate = dependencies.generate ?? generateRivusDigest;
  const cache = new Map<string, CollectedRivusDigest>();

  return async (value) => {
    const input = parseInput(value);
    if (!input.phase) return generate(input.request);

    const key = cacheKey(input.request);
    let collected = cache.get(key);
    if (input.phase === "collect" || !collected) {
      collected = await collect(input.request);
      cache.set(key, collected);
      trimCache(cache);
    }
    if (input.phase === "collect") {
      return {
        ...(collected.day ? { day: collected.day } : {}),
        editorialContract: {
          outputShape: "Array<{ref, summary}>",
          summaryLength: "one-to-two Chinese sentences, at most 180 characters",
          summaryPolicy: "write summaries only for evidence with summaryPolicy=required",
        },
        evidence: buildSubscriptionEvidence(collected.document),
        generatedAt: collected.document.generatedAt,
        phase: "collect",
      };
    }

    const editorial = buildSubscriptionEditorial(collected.document, input.draft);
    const document = collected.day
      ? { ...collected.document, displayDate: collected.day }
      : collected.document;
    const paperCandidateCount = document.candidates.filter(
      (candidate) => candidate.category === "paper",
    ).length;
    cache.delete(key);
    return {
      candidateCount: document.candidates.length - paperCandidateCount,
      generatedAt: document.generatedAt,
      markdown: renderMarkdownDigest(document, { summaries: editorial.summaries }),
      paperCandidateCount,
      phase: "render",
      ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
      ...(document.audit ? { audit: document.audit as RunAudit } : {}),
    };
  };
}

function parseInput(value: unknown): {
  draft?: unknown;
  phase?: "collect" | "render";
  request: Record<string, unknown>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Subscription Tool input must be an object.");
  }
  const record = value as Record<string, unknown>;
  const phase = record.phase;
  if (phase !== undefined && phase !== "collect" && phase !== "render") {
    throw new Error("phase must be collect or render.");
  }
  if (phase && typeof record.occurrence !== "string") {
    throw new Error("two-phase subscription execution requires occurrence.");
  }
  const { draft, phase: _phase, ...request } = record;
  return {
    draft,
    ...(phase ? { phase } : {}),
    request,
  };
}

function cacheKey(request: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(request).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function trimCache(cache: Map<string, CollectedRivusDigest>): void {
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
}
