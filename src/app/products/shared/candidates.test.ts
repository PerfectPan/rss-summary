import { describe, expect, it } from "vite-plus/test";

import type { CandidateProject } from "../../../editorial/index.js";
import { auditReasonWhenFiltered, runAuditCounts, runAuditDecisions } from "./candidates.js";

const candidate = (key: string, category: CandidateProject["category"] = "release"): CandidateProject =>
  ({
    key,
    category,
    events: [{ id: `${key}-event` }],
    signals: []
  }) as unknown as CandidateProject;

describe("run audit helpers", () => {
  it("counts the selected and research-pending candidates", () => {
    const candidates = [candidate("a"), candidate("b", "paper"), candidate("c", "paper")];
    expect(runAuditCounts({ fetched: 9, inWindow: 3, ranked: 7, candidates })).toEqual({
      fetched: 9,
      inWindow: 3,
      ranked: 7,
      selected: 1,
      researchPending: 2
    });
  });

  it("binds the shared filtered reason and keeps the product's own branch", () => {
    const researched = candidate("researched", "paper");
    const pending = candidate("pending", "paper");
    const researchSet = new Set<CandidateProject>([researched, pending]);
    const candidates = [candidate("chosen")];
    const ranked = [candidate("in-research", "paper"), pending, researched, candidates[0]!];

    const reasons = runAuditDecisions(
      ranked,
      candidates,
      auditReasonWhenFiltered(researchSet, (value) => {
        if (value === researched) {
          return "candidate was already researched";
        }
        return undefined;
      })
    );
    expect(reasons).toHaveLength(4);
    expect(reasons[0]!.reason).toBe("paper abstract did not pass interest or quota");
    expect(reasons[1]!.reason).toBe("not selected");
    expect(reasons[2]!.reason).toBe("candidate was already researched");
    // A selected candidate's reason belongs to the presentation machinery, not the filtered reason.
    expect(typeof reasons[3]!.reason).toBe("string");
  });
});
