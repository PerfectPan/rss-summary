import type { PresentationDepth, PresentationReasonCode } from "../../subscription/index.js";

export type CandidateDecision = {
  key: string;
  label: string;
  url?: string;
  score: number;
  depth: PresentationDepth;
  presentationReasonCode?: PresentationReasonCode;
  presentationEvidence?: string;
  status: "selected" | "research-pending" | "filtered";
  reason: string;
};
