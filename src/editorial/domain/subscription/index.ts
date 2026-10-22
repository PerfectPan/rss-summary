export {
  presentationDecisionForCandidate,
  presentationDepthForCandidate,
  repositoryFactsForCandidate,
  selectCandidatePresentationSections,
  DEFAULT_LINK_SECTION_LIMIT,
  DEFAULT_SUMMARY_SECTION_LIMIT,
} from "./policies/presentation.js";
export { scoreAcquired, selectResearchCandidates } from "./policies/scoring.js";
export { applyEditorialSelectionToAudit } from "./services/editorial-audit.js";
export type {
  ActivityCard,
  CandidatePresentationSections,
  CandidateProject,
  EditorialSelectionDecision,
  PresentationDecision,
  PresentationDepth,
  PresentationPolicy,
  PresentationReasonCode,
  ScoreOptions,
} from "./value-objects/candidate.js";
