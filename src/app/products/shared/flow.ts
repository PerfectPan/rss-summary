import { Effect } from "effect";

import { deliver, FeedStateStore, markDelivered, type FeedState, type RunAudit } from "../../../delivery/index.js";
import type { CandidateProject } from "../../../editorial/index.js";
import type { AppConfig } from "../../config/env.js";
import type { AppServices } from "../../layers.js";

/** The deliver step both product flows share: render, run-log, and the undelivered marker on the run's state file. */
export function runProductFlow<D extends { candidates: CandidateProject[]; generatedAt: string; audit?: RunAudit }, R>(
  config: AppConfig,
  collect: Effect.Effect<{ audit: RunAudit; document: D; state: FeedState }, Error, R>,
  stateFile: string,
  eventIds: (candidate: CandidateProject) => string[],
  render: (document: D, format: AppConfig["outputFormat"]) => string
): Effect.Effect<void, Error, R | AppServices> {
  return Effect.gen(function* () {
    const { audit, document, state } = yield* collect;
    const output = render(document, config.outputFormat);

    const deliveredCandidates =
      config.outputFormat === "markdown"
        ? document.candidates.filter((candidate) => candidate.category !== "paper")
        : document.candidates;
    yield* deliver({
      runLogDir: config.runLogDir,
      audit,
      output,
      dryRun: config.dryRun,
      ...(config.onlyNew && !config.dryRun
        ? {
            afterSend: FeedStateStore.use((store) =>
              store.save(stateFile, markDelivered(state, deliveredCandidates.flatMap(eventIds), document.generatedAt))
            )
          }
        : {})
    });
  });
}
