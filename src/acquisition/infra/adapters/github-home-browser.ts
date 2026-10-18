import { existsSync } from "node:fs";

import { Effect } from "effect";

import {
  normalizeHomeCardSnapshots,
  type HomeFeedCardSnapshot,
} from "../../domain/item/adapters/github-home.js";
import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import { readConduitSnapshots, readRenderedSnapshots, saveLoginStorageState } from "./browser.js";

export type HomeFeedSnapshotReader = () => Effect.Effect<HomeFeedCardSnapshot[], Error>;

export type GithubHomeFetchMode = "conduit" | "browser";

export type GithubHomeClientOptions = {
  storageState: string;
  fetchMode?: GithubHomeFetchMode;
  headless?: boolean;
  browserChannel?: string;
  timeoutMs?: number;
  conduitFetcher?: HomeFeedSnapshotReader;
  browserFetcher?: HomeFeedSnapshotReader;
};

/** Conduit snapshots first, the rendered feed as fallback. */
export function readHomeEvents(
  options: GithubHomeClientOptions,
): Effect.Effect<ActivityCardDto[], Error> {
  if (!existsSync(options.storageState)) {
    return Effect.fail(
      new Error(
        `GitHub Home storage state not found: ${options.storageState}. Run 'rss-summary github-home login' first.`,
      ),
    );
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  const conduit =
    options.conduitFetcher ?? (() => readConduitSnapshots(options.storageState, timeoutMs));
  const browser =
    options.browserFetcher ??
    (() =>
      readRenderedSnapshots(options.storageState, timeoutMs, {
        headless: options.headless ?? true,
        browserChannel: options.browserChannel ?? "chrome",
      }));
  if (options.fetchMode === "browser") {
    return Effect.map(browser(), normalizeHomeCardSnapshots);
  }
  return Effect.catch(
    Effect.flatMap(conduit(), (snapshots) => {
      const events = normalizeHomeCardSnapshots(snapshots);
      if (events.length === 0) {
        return Effect.fail(new Error("GitHub conduit feed returned no supported Home cards."));
      }
      return Effect.succeed(events);
    }),
    () => Effect.map(browser(), normalizeHomeCardSnapshots),
  );
}

/* v8 ignore start -- Playwright login flow, exercised manually */
export function saveGithubHomeStorageState(options: {
  storageState: string;
  browserChannel?: string;
}): Effect.Effect<void, Error> {
  return saveLoginStorageState(options);
}
/* v8 ignore stop */
