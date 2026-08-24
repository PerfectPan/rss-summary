import {
  applySubscriptionSelection,
  buildSubscriptionEditorial,
  buildSubscriptionEvidence,
  excludeSubscriptionResearchFailures,
  validateSubscriptionSelectionDraft,
  validateSubscriptionResearch,
  type SubscriptionEvidence,
} from "../domain/subscription-editorial.js";
import type { RunAudit, RunEditorialSelectionDecision } from "../domain/run-audit.js";
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
  | {
      day?: string;
      editorialContract: {
        decisionShape: "Array<{ref, selected, reason}>";
        selectionPolicy: "select only items worth sending; an empty selection suppresses delivery";
      };
      evidence: SubscriptionEvidence[];
      generatedAt: string;
      phase: "select";
      selectedCount: number;
      selection: ReadonlyArray<{ ref: string; selected: boolean; reason: string }>;
    }
  | SubscriptionRenderResult;

type SubscriptionRenderResult = RivusDigestResult & {
  phase: "render";
  selectedCount: number;
  selection: ReadonlyArray<{ ref: string; selected: boolean; reason: string }>;
};

type SubscriptionToolDependencies = {
  collect?: (value: unknown) => Promise<CollectedRivusDigest>;
  generate?: (value: unknown) => Promise<RivusDigestResult>;
};

/** Three-phase Tool executor: collect evidence, select worthwhile items, then render model copy. */
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

    if (input.phase === "select") {
      const evidence = buildSubscriptionEvidence(collected.document);
      const selection = validateSubscriptionSelectionDraft(input.selection, evidence);
      return {
        ...(collected.day ? { day: collected.day } : {}),
        editorialContract: {
          decisionShape: "Array<{ref, selected, reason}>",
          selectionPolicy:
            "select only items worth sending; an empty selection suppresses delivery",
        },
        evidence: buildSubscriptionEvidence(collected.document),
        generatedAt: collected.document.generatedAt,
        phase: "select",
        selectedCount: selection.decisions.filter((item) => item.selected).length,
        selection: selection.decisions,
      };
    }

    const evidence = buildSubscriptionEvidence(collected.document);
    const selection = validateSubscriptionSelectionDraft(input.selection, evidence);
    const research = validateSubscriptionResearch(input.research, evidence);
    const researchedRefs = new Set(research.map((item) => item.ref));
    const missingResearchRefs = new Set(
      evidence
        .filter(
          (item) =>
            item.summaryPolicy === "required" &&
            selection.selectedRefs.has(item.id) &&
            !researchedRefs.has(item.id),
        )
        .map((item) => item.id),
    );
    const effectiveSelection = excludeSubscriptionResearchFailures(
      selection,
      new Set([
        ...research.filter((item) => item.status === "failed").map((item) => item.ref),
        ...missingResearchRefs,
      ]),
    );
    const selectedDocument = applySubscriptionSelection(collected.document, effectiveSelection);
    const effectiveResearch = research.filter(
      (item) => item.status === "ok" && effectiveSelection.selectedRefs.has(item.ref),
    );
    const editorial = buildSubscriptionEditorial(selectedDocument, input.draft, effectiveResearch);
    const document = collected.day
      ? { ...selectedDocument, displayDate: collected.day }
      : selectedDocument;
    const paperCandidateCount = document.candidates.filter(
      (candidate) => candidate.category === "paper",
    ).length;
    const selectedCount = document.candidates.length - paperCandidateCount;
    const audit = document.audit
      ? applyEditorialSelectionToAudit(
          document.audit as RunAudit,
          effectiveSelection.decisions,
          selectedCount,
        )
      : undefined;
    cache.delete(key);
    return {
      candidateCount: document.candidates.length - paperCandidateCount,
      generatedAt: document.generatedAt,
      markdown: renderMarkdownDigest(document, { summaries: editorial.summaries }),
      paperCandidateCount,
      phase: "render",
      selectedCount,
      selection: effectiveSelection.decisions,
      ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
      ...(audit ? { audit } : {}),
    };
  };
}

function parseInput(value: unknown): {
  draft?: unknown;
  phase?: "collect" | "select" | "render";
  research?: unknown;
  request: Record<string, unknown>;
  selection?: unknown;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Subscription Tool input must be an object.");
  }
  const record = value as Record<string, unknown>;
  const phase = record.phase;
  if (phase !== undefined && phase !== "collect" && phase !== "select" && phase !== "render") {
    throw new Error("phase must be collect, select, or render.");
  }
  if (phase && typeof record.occurrence !== "string") {
    throw new Error("multi-phase subscription execution requires occurrence.");
  }
  const { draft, phase: _phase, research, selection, ...request } = record;
  return {
    draft,
    ...(phase ? { phase } : {}),
    ...(research === undefined ? {} : { research }),
    request,
    ...(selection === undefined ? {} : { selection }),
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

function applyEditorialSelectionToAudit(
  audit: RunAudit,
  decisions: ReadonlyArray<RunEditorialSelectionDecision>,
  selectedCount: number,
): RunAudit {
  const decisionByRef = new Map(decisions.map((decision) => [decision.ref, decision]));
  return {
    ...audit,
    counts: { ...audit.counts, selected: selectedCount },
    candidates: audit.candidates.map((candidate) => {
      const decision = decisionByRef.get(candidate.key);
      return decision?.selected
        ? candidate
        : {
            ...candidate,
            reason: decision?.reason ?? "AI selection omitted this item",
            status: "filtered" as const,
          };
    }),
    editorialSelection: {
      decisions: [...decisions],
      selectedCount,
    },
  };
}
