/**
 * Delivery module: the delivered/researched ledger, Daily AI receipts, run
 * records, notification, and the repositories persisting them.
 */
import { Layer } from "effect";

import { DiagnosticsStore, Notifier, FeedStateStore, RunArchive } from "./application/ports.js";
import { NotifierLive, type NotifierOptions } from "./infra/notifier/notifier.js";
import { FeedStateFileLive } from "./infra/repository/feed-state-file.js";
import { RunArchiveFilesLive } from "./infra/repository/run-archive-files.js";
import { DiagnosticsFileLive } from "./infra/repository/diagnostics-file.js";

export {
  createEmptyFeedState,
  filterUndelivered,
  filterUnresearched,
  markDelivered,
  markResearched,
  type FeedState,
  type ResearchRecord,
} from "./domain/ledger/index.js";
export {
  commitDailyAiDeliveryReceipt,
  createDailyAiDeliveryReceipt,
  type DailyAiDeliveryReceipt,
} from "./domain/receipt/index.js";
export {
  isFailedRun,
  type RunAudit,
  type RunCandidateDecision,
  type RunDelivery,
  type RunEditorialSelectionDecision,
  type RunPresentationDepth,
  type RunPresentationReasonCode,
  type RunProduct,
  type RunSourceResult,
  type StoredRunAudit,
} from "./domain/run-audit/index.js";
export {
  Notifier,
  FeedStateStore,
  RunArchive,
  DiagnosticsStore,
  type DailyAiDiagnosticSnapshot,
  type SavedRunArtifact,
} from "./application/ports.js";
export { deliver, type DeliveryOrder } from "./application/use-cases/deliver.js";
export {
  recordResearch,
  type ResearchSuggestion,
} from "./application/use-cases/record-research.js";
export {
  listRuns,
  listFailedRuns,
  runArtifactForLabel,
  readRunArtifact,
  type RunSummary,
} from "./application/use-cases/inspect-runs.js";
export { NotifierLive, type NotifierOptions } from "./infra/notifier/notifier.js";
export {
  loadFeedState,
  saveFeedState,
  FeedStateFileLive,
} from "./infra/repository/feed-state-file.js";
export {
  listRunArtifacts,
  loadRunArtifact,
  runArtifactLabel,
  saveRunArtifact,
  RunArchiveFilesLive,
} from "./infra/repository/run-archive-files.js";
export {
  saveDailyAiDiagnostics,
  DiagnosticsFileLive,
} from "./infra/repository/diagnostics-file.js";

export type DeliveryOptions = NotifierOptions & {
  /** Environment used to resolve the diagnostics directory. */
  readonly env?: NodeJS.ProcessEnv;
};

/** Assembles every delivery port implementation into one layer. */
export const DeliveryLive = (
  options: DeliveryOptions = {},
): Layer.Layer<Notifier | FeedStateStore | RunArchive | DiagnosticsStore> =>
  Layer.mergeAll(
    NotifierLive(options),
    FeedStateFileLive,
    RunArchiveFilesLive,
    DiagnosticsFileLive(options.env ?? process.env),
  );
