// Moved to src/delivery/. Re-export only: tests/golden imports this path and
// must stay untouched during the transition.
export { saveDailyAiDiagnostics, type DailyAiDiagnosticSnapshot } from "../delivery/index.js";
