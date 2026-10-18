/**
 * Delivery ledger: what has already been delivered and what has been researched.
 * Rules work on caller-supplied ids and keys so the ledger never needs to know
 * how candidates are shaped (research keys stay with the editorial layer).
 */
export type ResearchRecord = {
  at: string;
  decision?: string;
  reason?: string;
};

export type FeedState = {
  seen: Record<string, string>;
  researched: Record<string, ResearchRecord>;
};

export function createEmptyFeedState(): FeedState {
  return {
    seen: {},
    researched: {},
  };
}

/**
 * Return a new state with the given event ids recorded as delivered at `at`.
 * Existing keys keep their original position; new keys are appended in order,
 * so serializing the result stays byte-identical to the historical format.
 */
export function markDelivered(state: FeedState, ids: readonly string[], at: string): FeedState {
  const seen = { ...state.seen };
  for (const id of ids) {
    if (id) seen[id] = at;
  }
  return { ...state, seen };
}

/** Return a new state with the research decision recorded under `key`. */
export function markResearched(state: FeedState, key: string, record: ResearchRecord): FeedState {
  return { ...state, researched: { ...state.researched, [key]: record } };
}
