import { Effect } from "effect";

import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../config/env.js";
import { appLayerFromConfig } from "../../layers.js";
import { runCliEffect } from "../../runtime.js";
import { renderJsonDigest, renderMarkdownDigest } from "../../render/render.js";
import { runSubscriptionFlow } from "./flow.js";

type Writable = {
  write(chunk: string): unknown;
};

/** `rss-summary digest [--rss-only] [digest options]` */
export async function runDigestCommand(
  argv: string[],
  deps: { stdout?: Writable; stderr?: Writable } = {},
): Promise<number> {
  const stderr = deps.stderr ?? process.stderr;
  const config = Effect.map(loadEnvConfig(), (base) => applyCliArgs(base, parseCliArgs(argv)));
  return runCliEffect(
    Effect.flatMap(config, (resolved) =>
      runSubscriptionFlow(resolved, (document, format) =>
        format === "json" ? renderJsonDigest(document) : renderMarkdownDigest(document),
      ),
    ),
    { stderr, layer: appLayerFromConfig(config) },
  );
}
