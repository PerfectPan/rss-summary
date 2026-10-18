import type { EditorialSelectionDecision } from "../value-objects/candidate.js";

type SelectionAudit = {
  counts: {
    fetched: number;
    inWindow: number;
    ranked: number;
    selected: number;
    researchPending: number;
  };
  candidates: ReadonlyArray<{ key: string; reason: string; status: string }>;
};

/** Write the model selection onto the run audit. Delivery stores the record. */
export function applyEditorialSelectionToAudit<T extends SelectionAudit>(
  audit: T,
  decisions: ReadonlyArray<EditorialSelectionDecision>,
  selectedCount: number,
): T & {
  editorialSelection: {
    decisions: EditorialSelectionDecision[];
    selectedCount: number;
  };
} {
  const decisionByRef = new Map(decisions.map((decision) => [decision.ref, decision]));
  return {
    ...audit,
    counts: { ...audit.counts, selected: selectedCount },
    candidates: audit.candidates.map((candidate) => {
      const decision = decisionByRef.get(candidate.key);
      return decision?.selected
        ? candidate
        : {
            ...candidate,
            reason: decision?.reason ?? "AI selection omitted this item",
            status: "filtered" as const,
          };
    }),
    editorialSelection: {
      decisions: [...decisions],
      selectedCount,
    },
  };
}
