import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Effect, Layer } from "effect";

import { createEmptyFeedState, type FeedState } from "../../domain/ledger/index.js";
import { FeedStateStore } from "../../application/ports.js";
import { decodeFeedState } from "../models/feed-state.js";

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Missing files load as the empty state; missing sections default to empty. */
export function loadFeedState(path: string): FeedState {
  if (!existsSync(path)) return createEmptyFeedState();
  return decodeFeedState(JSON.parse(readFileSync(path, "utf8")));
}

export function saveFeedState(path: string, state: FeedState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export const FeedStateFileLive: Layer.Layer<FeedStateStore> = Layer.succeed(FeedStateStore, {
  load: (path) => Effect.try({ try: () => loadFeedState(path), catch: toError }),
  save: (path, state) => Effect.try({ try: () => saveFeedState(path, state), catch: toError }),
});
