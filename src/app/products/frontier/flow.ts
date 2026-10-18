import { Effect } from "effect";

import { deliver, FeedStateStore, markDelivered } from "../../../delivery/index.js";
import {
  collectIndustryBrief,
  industryEventIds,
  type IndustryBriefDocument,
} from "../shared/industry.js";
import type { AppConfig } from "../../config/env.js";
import type { AppServices } from "../../layers.js";

/** Full frontier workflow for the CLI. */
export function runIndustryFlow(
  config: AppConfig,
  render: (document: IndustryBriefDocument, format: AppConfig["outputFormat"]) => string,
): Effect.Effect<void, Error, AppServices> {
  return Effect.gen(function* () {
    const { audit, document, state } = yield* collectIndustryBrief(config);
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
              store.save(
                config.industryStateFile,
                markDelivered(
                  state,
                  deliveredCandidates.flatMap(industryEventIds),
                  document.generatedAt,
                ),
              ),
            ),
          }
        : {}),
    });
  });
}
