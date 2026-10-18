import { Effect } from "effect";

import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../config/env.js";
import { appLayerFromConfig } from "../../layers.js";
import { runCliEffect } from "../../runtime.js";
import {
  renderJsonIndustryBrief,
  renderMarkdownIndustryBrief,
} from "../../render/industry-render.js";
import { runIndustryFlow } from "./flow.js";

type Writable = {
  write(chunk: string): unknown;
};

/** `rss-summary industry [--json] [--day YYYY-MM-DD] [--only-new] [--dry-run]` */
export async function runIndustryCommand(
  argv: string[],
  deps: { stdout?: Writable; stderr?: Writable } = {},
): Promise<number> {
  const stderr = deps.stderr ?? process.stderr;
  const config = Effect.map(loadEnvConfig(), (base) => applyCliArgs(base, parseCliArgs(argv)));
  return runCliEffect(
    Effect.flatMap(config, (resolved) =>
      runIndustryFlow(resolved, (document, format) =>
        format === "json"
          ? renderJsonIndustryBrief(document)
          : renderMarkdownIndustryBrief(document),
      ),
    ),
    { stderr, layer: appLayerFromConfig(config) },
  );
}
