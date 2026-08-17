import { selectCandidatePresentationSections } from "./attention.js";
import { candidateIdentity, type CandidateProject, type DigestDocument } from "./digest.js";
import { canonicalizeUrl, compactSummary, formatCompactCount } from "./text.js";

export type SubscriptionEvidenceKind =
  | "activity"
  | "article"
  | "pull-request"
  | "release"
  | "repository";

export type SubscriptionEvidence = {
  facts: string[];
  id: string;
  kind: SubscriptionEvidenceKind;
  rawText: string;
  sourceName: string;
  summaryPolicy: "none" | "required";
  title: string;
  url: string;
};

export type SubscriptionEditorialItem = {
  ref: string;
  summary: string;
};

export type SubscriptionEditorial = {
  evidence: SubscriptionEvidence[];
  summaries: ReadonlyMap<string, string>;
};

export type SubscriptionSelectionDecision = {
  ref: string;
  selected: boolean;
  reason: string;
};

export type SubscriptionSelection = {
  decisions: ReadonlyArray<SubscriptionSelectionDecision>;
  selectedRefs: ReadonlySet<string>;
};

export type SubscriptionResearch = {
  content?: string;
  fetchedUrl?: string;
  ref: string;
  status: "failed" | "ok";
  title?: string;
  url: string;
};

/** Build the bounded, source-grounded contract exposed to the automation model. */
export function buildSubscriptionEvidence(document: DigestDocument): SubscriptionEvidence[] {
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
        id: subscriptionEvidenceId(candidate),
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
          `https://github.com/${candidate.repo}`,
      },
    ];
  });
}

/**
 * Accept only short summaries tied to known evidence. The model is allowed to
 * rephrase source text, but may not introduce numeric claims absent upstream.
 */
export function validateSubscriptionEditorialDraft(
  value: unknown,
  evidence: SubscriptionEvidence[],
): SubscriptionEditorialItem[] {
  if (!Array.isArray(value)) throw new Error("editorial output must be an array");
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("editorial item must be an object");
    const record = entry as Record<string, unknown>;
    const ref = typeof record.ref === "string" ? record.ref : "";
    const source = byId.get(ref);
    if (!source) throw new Error(`unknown reference: ${ref}`);
    if (source.summaryPolicy !== "required")
      throw new Error(`reference does not require an editorial summary: ${ref}`);
    if (seen.has(ref)) throw new Error(`duplicate reference: ${ref}`);
    seen.add(ref);

    const summary = cleanSummary(record.summary);
    const claims = numericClaims(summary);
    const groundedClaims = new Set(
      numericClaims([source.title, source.rawText, ...source.facts].join(" ")),
    );
    const missing = claims.find((claim) => !groundedClaims.has(claim));
    if (missing) throw new Error(`summary numeric claim ${missing} has no source evidence`);
    return { ref, summary };
  });
}

export function buildSubscriptionEditorial(
  document: DigestDocument,
  draft?: unknown,
  research?: unknown,
): SubscriptionEditorial {
  const evidence = mergeSubscriptionResearch(buildSubscriptionEvidence(document), research);
  const items = acceptValidSubscriptionEditorialItems(draft, evidence);
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

export function validateSubscriptionResearch(
  value: unknown,
  evidence: SubscriptionEvidence[],
): SubscriptionResearch[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("research output must be an array");
  const byRef = new Map(evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("research item must be an object");
    const record = entry as Record<string, unknown>;
    const ref = typeof record.ref === "string" ? record.ref : "";
    const source = byRef.get(ref);
    if (!source) throw new Error(`unknown research reference: ${ref}`);
    if (seen.has(ref)) throw new Error(`duplicate research reference: ${ref}`);
    seen.add(ref);
    const url = typeof record.url === "string" ? record.url : "";
    if (canonicalizeUrl(url) !== canonicalizeUrl(source.url))
      throw new Error(`research URL does not match evidence: ${ref}`);
    const status = record.status;
    if (status !== "ok" && status !== "failed") throw new Error(`invalid research status: ${ref}`);
    const content = record.content;
    if (status === "ok" && (typeof content !== "string" || content.trim().length < 80)) {
      throw new Error(`research content is too short: ${ref}`);
    }
    return {
      ...(typeof content === "string" ? { content } : {}),
      ...(typeof record.fetchedUrl === "string" ? { fetchedUrl: record.fetchedUrl } : {}),
      ref,
      status,
      ...(typeof record.title === "string" ? { title: record.title } : {}),
      url,
    };
  });
}

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

/**
 * Validate the model's second-pass selection against the collected evidence.
 * Omitted evidence is treated as rejected, never as implicitly selected.
 */
export function validateSubscriptionSelectionDraft(
  value: unknown,
  evidence: SubscriptionEvidence[],
): SubscriptionSelection {
  if (!Array.isArray(value)) throw new Error("selection output must be an array");
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const decisions: SubscriptionSelectionDecision[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new Error("selection item must be an object");
    const record = entry as Record<string, unknown>;
    const ref = typeof record.ref === "string" ? record.ref : "";
    if (!byId.has(ref)) throw new Error(`unknown selection reference: ${ref}`);
    if (seen.has(ref)) throw new Error(`duplicate selection reference: ${ref}`);
    if (typeof record.selected !== "boolean")
      throw new Error(`selection must specify selected: ${ref}`);
    const reason = boundedSelectionReason(record.reason);
    seen.add(ref);
    decisions.push({ ref, selected: record.selected, reason });
  }

  for (const item of evidence) {
    if (seen.has(item.id)) continue;
    decisions.push({
      ref: item.id,
      selected: false,
      reason: "AI selection omitted this item",
    });
  }

  return {
    decisions,
    selectedRefs: new Set(decisions.filter((item) => item.selected).map((item) => item.ref)),
  };
}

/** Apply the AI selection before editorial summaries and presentation rendering. */
export function applySubscriptionSelection(
  document: DigestDocument,
  selection: SubscriptionSelection,
): DigestDocument {
  const candidates = document.candidates.filter((candidate) =>
    selection.selectedRefs.has(candidateIdentity(candidate)),
  );
  return { ...document, candidates };
}

export function subscriptionEvidenceId(candidate: CandidateProject): string {
  return candidateIdentity(candidate);
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

export function repositoryFactsForCandidate(candidate: CandidateProject): string[] {
  if (!candidate.repository || candidate.category !== "discovery") return [];
  return [
    `⭐ ${formatCompactCount(candidate.repository.stargazersCount)}`,
    candidate.repository.language ?? undefined,
  ].filter((value): value is string => Boolean(value));
}

function cleanSummary(value: unknown): string {
  if (typeof value !== "string") throw new Error("summary must be a string");
  const summary = bounded(value, 180);
  if (summary.length < 8) throw new Error("summary is too short");
  const normalizedSentenceStops = summary.replace(/\.(?=\s|$)/gu, "。");
  const sentences = normalizedSentenceStops.match(/[^。！？!?；;]+[。！？!?；;]?/gu) ?? [];
  if (sentences.length > 2) throw new Error("summary must contain at most two sentences");
  return summary;
}

function boundedSelectionReason(value: unknown): string {
  if (typeof value !== "string") throw new Error("selection reason must be a string");
  const reason = bounded(value, 240);
  if (reason.length < 4) throw new Error("selection reason is too short");
  return reason;
}

function acceptValidSubscriptionEditorialItems(
  value: unknown,
  evidence: SubscriptionEvidence[],
): SubscriptionEditorialItem[] {
  if (!Array.isArray(value)) return [];
  const accepted: SubscriptionEditorialItem[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    try {
      const item = validateSubscriptionEditorialDraft([entry], evidence)[0];
      if (!item || seen.has(item.ref)) continue;
      seen.add(item.ref);
      accepted.push(item);
    } catch {
      // A malformed model item must not discard other grounded summaries.
    }
  }
  return accepted;
}

function numericClaims(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)*(?:\s?(?:%|％|B|M|K|亿|万))?/giu)].map(([claim]) =>
    claim.replace(/[\s,]/gu, "").replace("％", "%").toLowerCase(),
  );
}

function bounded(value: string, maximum: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maximum);
}
