import { applyScoringContext, refreshRouting } from "../../../integrations/shared/index.js";
import { scoreAcquired, selectResearchCandidates, type CandidateProject } from "../../../editorial/index.js";
import { candidateDecision } from "./candidate-decision.js";

/**
 * Window-filtered entries scored against the interests and capped by the paper quota — the candidate pipeline both
 * products share.
 */
export function scoreAcquiredCandidates(
  acquired: Parameters<typeof scoreAcquired>[0],
  context: Parameters<typeof applyScoringContext>[1],
  config: { interests: string[]; maxPapers: number }
): { rankedCandidates: CandidateProject[]; allCandidates: CandidateProject[] } {
  const rankedCandidates = scoreAcquired(
    acquired.map((entry) => applyScoringContext(refreshRouting(entry), context)),
    { interests: config.interests, now: Date.now() }
  );
  return { rankedCandidates, allCandidates: selectResearchCandidates(rankedCandidates, config.maxPapers) };
}

/** The run audit's candidate counts, as every product reports them. */
export function runAuditCounts(input: {
  fetched: number;
  inWindow: number;
  ranked: number;
  candidates: CandidateProject[];
}) {
  return {
    fetched: input.fetched,
    inWindow: input.inWindow,
    ranked: input.ranked,
    selected: input.candidates.filter((candidate) => candidate.category !== "paper").length,
    researchPending: input.candidates.filter((candidate) => candidate.category === "paper").length
  };
}

/** The reason a ranked candidate was filtered: the shared research-pending branch, then the product's own. */
export function auditReasonWhenFiltered(
  researchSet: Set<CandidateProject>,
  own: (value: CandidateProject) => string | undefined
): (value: CandidateProject) => string {
  return (value) => {
    if (!researchSet.has(value)) {
      return "paper abstract did not pass interest or quota";
    }
    return own(value) ?? "not selected";
  };
}

/** The run audit's per-candidate decisions, over the product's filtered-candidate reason. */
export function runAuditDecisions(
  rankedCandidates: CandidateProject[],
  candidates: CandidateProject[],
  reasonWhenFiltered: (candidate: CandidateProject) => string,
  presentationPolicy?: Parameters<typeof candidateDecision>[3]
) {
  return rankedCandidates.map((candidate) =>
    candidateDecision(candidate, candidates, reasonWhenFiltered, presentationPolicy)
  );
}
