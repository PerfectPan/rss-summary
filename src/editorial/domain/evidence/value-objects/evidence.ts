import type { CandidateProject } from "../../subscription/index.js";

export type EvidenceDocument = {
  candidates: CandidateProject[];
};

export type EvidenceIdentity = {
  identify: (candidate: CandidateProject) => string;
  fallbackUrl: (candidate: CandidateProject) => string;
};

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
