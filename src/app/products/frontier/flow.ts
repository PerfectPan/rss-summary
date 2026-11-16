import { Effect } from "effect";

import { collectIndustryBrief, industryEventIds, type IndustryBriefDocument } from "../shared/industry.js";
import type { AppConfig } from "../../config/env.js";
import type { AppServices } from "../../layers.js";
import { runProductFlow } from "../shared/flow.js";

/** Full frontier workflow for the CLI. */
export function runIndustryFlow(
  config: AppConfig,
  render: (document: IndustryBriefDocument, format: AppConfig["outputFormat"]) => string
): Effect.Effect<void, Error, AppServices> {
  return runProductFlow(config, collectIndustryBrief(config), config.industryStateFile, industryEventIds, render);
}
