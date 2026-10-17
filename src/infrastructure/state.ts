// Moved to src/delivery/. Re-export only: tests/golden imports this path and
// must stay untouched during the transition.
export {
  createEmptyFeedState,
  loadFeedState,
  saveFeedState,
  type FeedState,
  type ResearchRecord,
} from "../delivery/index.js";
