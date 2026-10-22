import { compactSummary } from "../../../../kernel/text.js";
import {
  repositoryFactsForCandidate,
  selectCandidatePresentationSections,
  type CandidateProject,
} from "../../subscription/index.js";
import { SubscriptionDraftValidationError } from "../errors/subscription-draft.js";
import {
  validateSubscriptionEditorialDraft,
  validateSubscriptionResearch,
} from "../policies/validation.js";
import type {
  EvidenceDocument,
  EvidenceIdentity,
  SubscriptionEditorial,
  SubscriptionEditorialItem,
  SubscriptionEvidence,
  SubscriptionEvidenceKind,
  SubscriptionSelection,
} from "../value-objects/evidence.js";

/** Build the bounded, source-grounded contract exposed to the automation model. */
export function assembleSubscriptionEvidence(
  document: EvidenceDocument,
  identity: EvidenceIdentity,
): SubscriptionEvidence[] {
  const sections = selectCandidatePresentationSections(document.candidates, {
    semanticSummaries: true,
    summaryLimit: 20,
  });
  const visible = new Set([...sections.summaries, ...sections.links]);
  return document.candidates.flatMap((candidate) => {
    if (!visible.has(candidate)) return [];
    if (candidate.category === "paper") return [];
    const event = candidate.events[0];
    const kind = evidenceKind(candidate);
    const rawText = bounded(
      candidate.description ?? event?.summary ?? candidate.repository?.description ?? "",
      1_200,
    );
    return [
      {
        facts: repositoryFactsForCandidate(candidate),
        id: identity.identify(candidate),
        kind,
        rawText,
        sourceName: candidate.actors.join(", ") || event?.sourceName || "未知来源",
        summaryPolicy:
          rawText && (kind === "article" || kind === "pull-request") ? "required" : "none",
        title: evidenceTitle(candidate),
        url:
          candidate.url ??
          event?.htmlUrl ??
          candidate.repository?.htmlUrl ??
          identity.fallbackUrl(candidate),
      },
    ];
  });
}

export function assembleSubscriptionEditorial(
  document: EvidenceDocument,
  identity: EvidenceIdentity,
  draft?: unknown,
  research?: unknown,
): SubscriptionEditorial {
  const evidence = mergeSubscriptionResearch(
    assembleSubscriptionEvidence(document, identity),
    research,
  );
  const items = validateSubscriptionEditorialItemsForRender(draft, evidence);
  const supplied = new Map(items.map(({ ref, summary }) => [ref, summary]));
  const summaries = new Map<string, string>();
  for (const item of evidence) {
    const summary = supplied.get(item.id);
    if (summary) {
      summaries.set(item.id, summary);
      continue;
    }
    if (item.summaryPolicy === "required") {
      summaries.set(item.id, compactSummary(item.rawText, item.title, item.sourceName));
    }
  }
  return { evidence, summaries };
}

/** Replace shallow feed excerpts with the Agent's fetched article evidence. */
export function mergeSubscriptionResearch(
  evidence: SubscriptionEvidence[],
  value: unknown,
): SubscriptionEvidence[] {
  const entries = validateSubscriptionResearch(value, evidence);
  if (entries.length === 0) return evidence;
  const researched = new Map(entries.map((entry) => [entry.ref, entry]));
  return evidence.map((item) => {
    const research = researched.get(item.id);
    if (!research || research.status !== "ok" || !research.content) return item;
    return {
      ...item,
      rawText: bounded(`${item.rawText}\n${research.content}`, 7_000),
      title: research.title?.trim() || item.title,
    };
  });
}

export function selectedSubscriptionCandidates(
  candidates: readonly CandidateProject[],
  selection: SubscriptionSelection,
  identify: (candidate: CandidateProject) => string,
): CandidateProject[] {
  return candidates.filter((candidate) => selection.selectedRefs.has(identify(candidate)));
}

/** Cancel the push of selected evidence whose research body is missing or failed to fetch. */
export function excludeSubscriptionResearchFailures(
  selection: SubscriptionSelection,
  failedRefs: ReadonlySet<string>,
): SubscriptionSelection {
  const decisions = selection.decisions.map((decision) =>
    failedRefs.has(decision.ref) && decision.selected
      ? { ...decision, reason: "研究正文缺失或抓取失败，已取消推送", selected: false }
      : decision,
  );
  return {
    decisions,
    selectedRefs: new Set(decisions.filter((item) => item.selected).map((item) => item.ref)),
  };
}

function evidenceKind(candidate: CandidateProject): SubscriptionEvidenceKind {
  if (candidate.eventTypes.includes("pull_request")) return "pull-request";
  if (candidate.category === "discovery") return "repository";
  if (candidate.category === "article") return "article";
  if (candidate.category === "release") return "release";
  return "activity";
}

function evidenceTitle(candidate: CandidateProject): string {
  return (
    candidate.label ??
    candidate.events[0]?.title ??
    candidate.repository?.fullName ??
    candidate.repo
  );
}

function validateSubscriptionEditorialItemsForRender(
  value: unknown,
  evidence: SubscriptionEvidence[],
): SubscriptionEditorialItem[] {
  const requiredRefs = new Set(
    evidence.filter((item) => item.summaryPolicy === "required").map((item) => item.id),
  );
  if (requiredRefs.size === 0 && value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SubscriptionDraftValidationError(
      [...requiredRefs].map((ref) => ({ ref, message: "summary is missing" })),
    );
  }
  const accepted: SubscriptionEditorialItem[] = [];
  const issues: Array<{ ref: string; message: string }> = [];
  const seen = new Set<string>();
  const providedRefs = new Set<string>();
  for (const entry of value) {
    const ref =
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).ref === "string"
        ? ((entry as Record<string, unknown>).ref as string)
        : "<missing-ref>";
    if (providedRefs.has(ref)) {
      issues.push({ message: "duplicate reference", ref });
      continue;
    }
    providedRefs.add(ref);
    try {
      const item = validateSubscriptionEditorialDraft([entry], evidence)[0];
      if (!item || seen.has(item.ref)) continue;
      seen.add(item.ref);
      accepted.push(item);
    } catch (error) {
      issues.push({
        message: error instanceof Error ? error.message : String(error),
        ref,
      });
    }
  }
  for (const ref of requiredRefs) {
    if (!providedRefs.has(ref)) issues.push({ message: "summary is missing", ref });
  }
  if (issues.length > 0) throw new SubscriptionDraftValidationError(issues);
  return accepted;
}

function bounded(value: string, maximum: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maximum);
}
