import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";

import { Effect } from "effect";

import type { ActivityCardDto } from "../../acquisition/index.js";

import { launchBrowser, openPage, openRequestContext } from "../shared/browser.js";
import { extractHomeFeedSnapshotsFromHtml, type HomeFeedCardSnapshot } from "./home/dto.js";
import { normalizeHomeCardSnapshots } from "./home/mapper.js";

const githubHomeUrl = "https://github.com/";
const conduitFeedPath = "/conduit/for_you_feed?requested_from_filter_event=true";

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

export function readConduitSnapshots(
  storageState: string,
  timeoutMs: number,
): Effect.Effect<HomeFeedCardSnapshot[], Error> {
  return Effect.scoped(
    Effect.gen(function* () {
      const context = yield* openRequestContext({
        baseURL: githubHomeUrl,
        storageState,
        extraHTTPHeaders: {
          Accept: "text/html, application/xhtml+xml",
          "Turbo-Frame": "conduit-feed-frame",
          "User-Agent": "rss-summary",
        },
      });
      const response = yield* Effect.tryPromise({
        try: () => context.get(conduitFeedPath, { timeout: timeoutMs }),
        catch: asError,
      });
      if (!response.ok()) {
        return yield* Effect.fail(new Error(`GitHub conduit feed returned ${response.status()}.`));
      }
      const html = yield* Effect.tryPromise({ try: () => response.text(), catch: asError });
      return extractHomeFeedSnapshotsFromHtml(html);
    }),
  );
}

export function readRenderedSnapshots(
  storageState: string,
  timeoutMs: number,
  options: { headless: boolean; browserChannel?: string },
): Effect.Effect<HomeFeedCardSnapshot[], Error> {
  return Effect.scoped(
    Effect.gen(function* () {
      const page = yield* openPage({
        browserChannel: options.browserChannel,
        headless: options.headless,
        context: { storageState },
      });
      yield* Effect.tryPromise({
        try: () => page.goto(githubHomeUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }),
        catch: asError,
      });
      if (page.url().includes("/login")) {
        return yield* Effect.fail(
          new Error(
            `GitHub Home login is required. Run 'rss-summary github-home login' to refresh ${storageState}.`,
          ),
        );
      }
      yield* Effect.tryPromise({
        try: () =>
          page.waitForSelector("#conduit-feed-frame article.js-feed-item-component", {
            timeout: timeoutMs,
          }),
        catch: (error) =>
          new Error(
            `GitHub Home feed did not render. Refresh ${storageState} with 'rss-summary github-home login'.`,
            { cause: error },
          ),
      });
      return yield* Effect.tryPromise({
        try: () => page.evaluate(extractHomeFeedSnapshots),
        catch: asError,
      });
    }),
  );
}

/* v8 ignore start -- Playwright login flow, exercised manually */
export function saveLoginStorageState(options: {
  storageState: string;
  browserChannel?: string;
}): Effect.Effect<void, Error> {
  return Effect.scoped(
    Effect.gen(function* () {
      const browser = yield* launchBrowser({
        headless: false,
        browserChannel: options.browserChannel ?? "chrome",
      });
      const context = yield* Effect.tryPromise({
        try: () => browser.newContext(),
        catch: asError,
      });
      const page = yield* Effect.tryPromise({ try: () => context.newPage(), catch: asError });
      yield* Effect.tryPromise({
        try: () => page.goto(githubHomeUrl, { waitUntil: "domcontentloaded" }),
        catch: asError,
      });
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        yield* Effect.promise(() =>
          rl.question(
            `Sign in to GitHub in the opened browser, make sure https://github.com/ shows Home, then press Enter here to save ${options.storageState}.`,
          ),
        );
      } finally {
        rl.close();
      }
      const visible = yield* Effect.tryPromise({
        try: () => page.evaluate(hasGitHubHomeFeedDom),
        catch: asError,
      });
      if (!visible) {
        return yield* Effect.fail(
          new Error("GitHub Home feed is not visible; sign in before saving the storage state."),
        );
      }
      yield* Effect.sync(() => {
        mkdirSync(dirname(options.storageState), { recursive: true });
      });
      yield* Effect.tryPromise({
        try: () => context.storageState({ path: options.storageState }),
        catch: asError,
      });
    }),
  );
}

/** In-page extraction of Home card snapshots; runs inside the browser. */
function extractHomeFeedSnapshots(): HomeFeedCardSnapshot[] {
  return Array.from(
    document.querySelectorAll("#conduit-feed-frame article.js-feed-item-component"),
  ).map((article) => {
    let card: Record<string, unknown> | null = null;
    try {
      const hydro = JSON.parse(article.getAttribute("data-hydro-view") || "null") as {
        payload?: { feed_card?: Record<string, unknown> };
      } | null;
      card = hydro?.payload?.feed_card ?? null;
    } catch {
      card = null;
    }

    const links = Array.from(article.querySelectorAll("a[href]")).map((link) => ({
      text: (link.textContent || "").replace(/\s+/gu, " ").trim(),
      href: (link as HTMLAnchorElement).href,
    }));

    return {
      id: article.id || "",
      card,
      text: (article.textContent || "").replace(/\s+/gu, " ").trim(),
      links,
    };
  });
}

function hasGitHubHomeFeedDom(): boolean {
  return (
    document.querySelector("feed-container") !== null &&
    document.querySelector("#conduit-feed-frame") !== null
  );
}
/* v8 ignore stop */

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
