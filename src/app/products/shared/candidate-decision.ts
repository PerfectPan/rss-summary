import { candidateIdentity } from "../../../integrations/shared/index.js";
import { decideCandidate } from "../../../editorial/index.js";

import type { CandidateProject } from "../../../editorial/index.js";

/** Bind the subscription candidate identity to editorial's decision record. */
export function candidateDecision(
  candidate: CandidateProject,
  selectedCandidates: CandidateProject[],
  reasonWhenFiltered: (candidate: CandidateProject) => string,
  presentationPolicy?: Parameters<typeof decideCandidate>[4],
) {
  return decideCandidate(
    candidate,
    selectedCandidates,
    reasonWhenFiltered,
    candidateIdentity,
    presentationPolicy,
  );
}
