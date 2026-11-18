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

export { filterUndelivered, filterUnresearched, markDelivered, type FeedState } from "./domain/ledger/index.js";
/** @internal */
export { createEmptyFeedState } from "./domain/ledger/index.js";
export { createDailyAiDeliveryReceipt, type DailyAiDeliveryReceipt } from "./domain/receipt/index.js";
export { type RunAudit, type RunSourceResult } from "./domain/run-audit/index.js";
/** @internal */
export { type RunDelivery } from "./domain/run-audit/index.js";
export { Notifier, FeedStateStore, RunArchive, DiagnosticsStore } from "./application/ports.js";
/** @internal */
export { type DailyAiDiagnosticSnapshot } from "./application/ports.js";
export { deliver } from "./application/use-cases/deliver.js";
export { recordResearch } from "./application/use-cases/record-research.js";
export {
  listRuns,
  listFailedRuns,
  runArtifactForLabel,
  readRunArtifact
} from "./application/use-cases/inspect-runs.js";
/** @internal */
export { NotifierLive } from "./infra/notifier/notifier.js";
export { loadFeedState } from "./infra/repository/feed-state-file.js";
/** @internal */
export { saveFeedState, FeedStateFileLive } from "./infra/repository/feed-state-file.js";
/** @internal */
export {
  listRunArtifacts,
  loadRunArtifact,
  runArtifactLabel,
  saveRunArtifact,
  RunArchiveFilesLive
} from "./infra/repository/run-archive-files.js";
export { saveDailyAiDiagnostics } from "./infra/repository/diagnostics-file.js";

export type DeliveryOptions = NotifierOptions & {
  /** Environment used to resolve the diagnostics directory. */
  readonly env?: NodeJS.ProcessEnv;
};

/** Assembles every delivery port implementation into one layer. */
export const DeliveryLive = (
  options: DeliveryOptions = {}
): Layer.Layer<Notifier | FeedStateStore | RunArchive | DiagnosticsStore> =>
  Layer.mergeAll(
    NotifierLive(options),
    FeedStateFileLive,
    RunArchiveFilesLive,
    DiagnosticsFileLive(options.env ?? process.env)
  );
