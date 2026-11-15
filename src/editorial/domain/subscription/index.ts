export {
  presentationDecisionForCandidate,
  presentationDepthForCandidate,
  repositoryFactsForCandidate,
  selectCandidatePresentationSections
} from "./policies/presentation.js";
export { scoreAcquired, selectResearchCandidates } from "./policies/scoring.js";
export { applyEditorialSelectionToAudit } from "./services/editorial-audit.js";
export type {
  CandidateProject,
  PresentationDepth,
  PresentationPolicy,
  PresentationReasonCode
} from "./value-objects/candidate.js";
