import { canonicalizeUrl } from "../../../../kernel/text.js";
import type {
  SubscriptionEditorialItem,
  SubscriptionEvidence,
  SubscriptionResearch,
  SubscriptionSelection,
  SubscriptionSelectionDecision,
} from "../value-objects/evidence.js";

/** Shared collection check. Callers keep their own throw-or-issue control flow. */
export function invalidEditorialCollectionMessage(value: unknown): string | undefined {
  if (!Array.isArray(value)) return "editorial output must be an array";
  return undefined;
}

/** Shared per-item check. Callers keep their own throw-or-issue control flow. */
export function invalidEditorialItemMessage(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object") return "editorial item must be an object";
  return undefined;
}

/**
 * Accept only short summaries tied to known evidence. The model is allowed to
 * rephrase source text, but may not introduce numeric claims absent upstream.
 */
export function validateSubscriptionEditorialDraft(
  value: unknown,
  evidence: SubscriptionEvidence[],
): SubscriptionEditorialItem[] {
  const invalidCollection = invalidEditorialCollectionMessage(value);
  if (invalidCollection) throw new Error(invalidCollection);
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  return (value as unknown[]).map((entry) => {
    const invalidItem = invalidEditorialItemMessage(entry);
    if (invalidItem) throw new Error(invalidItem);
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

function cleanSummary(value: unknown): string {
  if (typeof value !== "string") throw new Error("summary must be a string");
  const summary = value.replace(/\s+/gu, " ").trim();
  if (summary.length < 8) throw new Error("summary is too short");
  if (summary.length > 180) throw new Error("summary is too long");
  return summary;
}

function boundedSelectionReason(value: unknown): string {
  if (typeof value !== "string") throw new Error("selection reason must be a string");
  const reason = bounded(value, 240);
  if (reason.length < 4) throw new Error("selection reason is too short");
  return reason;
}

function numericClaims(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)*(?:\s?(?:%|％|B|M|K|亿|万))?/giu)].map(([claim]) =>
    claim.replace(/[\s,]/gu, "").replace("％", "%").toLowerCase(),
  );
}

function bounded(value: string, maximum: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maximum);
}
