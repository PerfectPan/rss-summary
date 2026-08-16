import type { CandidateProject, DigestDocument } from "./digest.js";
import { compactSummary, formatCompactCount } from "./text.js";

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

/** Build the bounded, source-grounded contract exposed to the automation model. */
export function buildSubscriptionEvidence(document: DigestDocument): SubscriptionEvidence[] {
  return document.candidates.flatMap((candidate) => {
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
): SubscriptionEditorial {
  const evidence = buildSubscriptionEvidence(document);
  let items: SubscriptionEditorialItem[] = [];
  if (draft !== undefined) {
    try {
      items = validateSubscriptionEditorialDraft(draft, evidence);
    } catch {
      items = [];
    }
  }
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

export function subscriptionEvidenceId(candidate: CandidateProject): string {
  const event = candidate.events[0];
  if (candidate.eventTypes.includes("pull_request")) {
    return `github-pull-request:${candidate.repo}:${event?.prNumber ?? event?.id ?? "unknown"}`;
  }
  if (candidate.source === "rss") {
    return `rss-${candidate.category}:${event?.id ?? candidate.repo}`;
  }
  if (candidate.source === "web") {
    return `web-${candidate.category}:${event?.id ?? candidate.repo}`;
  }
  if (candidate.category === "discovery") return `github-repository:${candidate.repo}`;
  if (candidate.category === "release") return `github-release:${event?.id ?? candidate.repo}`;
  return `github-activity:${event?.id ?? candidate.repo}`;
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
  const sentences = summary.match(/[^。！？!?]+[。！？!?]?/gu) ?? [];
  if (sentences.length > 2) throw new Error("summary must contain at most two sentences");
  return summary;
}

function numericClaims(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)*(?:\s?(?:%|％|B|M|K|亿|万))?/giu)].map(([claim]) =>
    claim.replace(/[\s,]/gu, "").replace("％", "%").toLowerCase(),
  );
}

function bounded(value: string, maximum: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maximum);
}
