/**
 * Structure of a stored run record. Delivery owns the storage shape only:
 * the concrete source-kind strings and the candidate decision rules belong to
 * the acquisition and editorial sides, so `RunSourceResult` is parameterized
 * over its `kind` instead of naming sources here.
 */
export type RunProduct = "subscriptions" | "frontier";

/**
 * Storage-format mirrors of editorial's presentation types, kept literal so
 * the persisted run record does not change shape when editorial refines them.
 */
export type RunPresentationDepth = "link" | "summary" | "research";

export type RunPresentationReasonCode =
  | "ordinary-update"
  | "semantic-summary"
  | "interest-match"
  | "major-release"
  | "breaking-change"
  | "deprecation"
  | "security-event"
  | "service-incident"
  | "paper-research";

export type RunSourceResult<Kind extends string = string> = {
  id: string;
  kind: Kind;
  name: string;
  url?: string;
  status: "ok" | "failed" | "skipped";
  itemCount: number;
  error?: string;
};

export type RunCandidateDecision = {
  key: string;
  label: string;
  url?: string;
  score: number;
  depth: RunPresentationDepth;
  presentationReasonCode?: RunPresentationReasonCode;
  presentationEvidence?: string;
  status: "selected" | "research-pending" | "filtered";
  reason: string;
};

export type RunEditorialSelectionDecision = {
  ref: string;
  selected: boolean;
  reason: string;
};

export type RunAudit<SourceKind extends string = string> = {
  version: 1 | 2;
  runId: string;
  product: RunProduct;
  generatedAt: string;
  windowLabel?: string;
  sources: RunSourceResult<SourceKind>[];
  counts: {
    fetched: number;
    inWindow: number;
    ranked: number;
    selected: number;
    researchPending: number;
  };
  candidates: RunCandidateDecision[];
  editorialSelection?: {
    selectedCount: number;
    decisions: RunEditorialSelectionDecision[];
  };
};

export type RunDelivery = {
  status: "delivered" | "dry-run" | "failed";
  completedAt: string;
  channel: "stdout" | "webhook";
  stateStatus: "updated" | "skipped" | "failed";
  error?: string;
};

export type StoredRunAudit<SourceKind extends string = string> = RunAudit<SourceKind> & {
  delivery: RunDelivery;
};

/** A run counts as failed when delivery failed, state failed, or any source failed. */
export function isFailedRun(run: StoredRunAudit): boolean {
  return (
    run.delivery.status === "failed" ||
    run.delivery.stateStatus === "failed" ||
    run.sources.some((source) => source.status === "failed")
  );
}
