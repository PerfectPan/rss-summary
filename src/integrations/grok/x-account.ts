import type { Effect } from "effect";

import { boundedInteger } from "../../kernel/index.js";
import {
  collectXAccountPosts as collectAccountPosts,
  createBudgetedNewsSearch,
  type CollectXAccountOptions,
  type XAccountPosts
} from "../../acquisition/index.js";

import { GrokXClient } from "./cli.js";
import { normalizeProvider } from "./identity.js";

type Dependencies = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  client?: CollectXAccountOptions["client"];
};

export type { XAccountPosts };

/** Preserves the historical default of the process environment for callers that omit `env`. */
export function collectXAccountPosts(
  value: Parameters<typeof collectAccountPosts>[0],
  dependencies: Dependencies = {}
): Effect.Effect<XAccountPosts, unknown> {
  const env = dependencies.env ?? process.env;
  return collectAccountPosts(value, {
    env,
    now: dependencies.now,
    client: dependencies.client,
    openClient: () =>
      new GrokXClient({
        executable: env.NEWS_GROK_EXECUTABLE?.trim() || undefined,
        model: env.NEWS_GROK_MODEL?.trim() || undefined,
        timeoutMs: boundedInteger(env.NEWS_GROK_TIMEOUT_MS, 120_000, 1_000, 180_000)
      }),
    openBudget: (options) => createBudgetedNewsSearch({ ...options, normalize: normalizeProvider })
  });
}
