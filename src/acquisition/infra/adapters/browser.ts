import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";

import { Effect } from "effect";

import {
  extractHomeFeedSnapshotsFromHtml,
  type HomeFeedCardSnapshot,
} from "../../domain/item/adapters/github-home.js";

const githubHomeUrl = "https://github.com/";
const conduitFeedPath = "/conduit/for_you_feed?requested_from_filter_event=true";

type BrowserOptions = {
  headless: boolean;
  browserChannel?: string;
};

/* v8 ignore start -- Playwright browser automation, exercised manually */
export function readConduitSnapshots(
  storageState: string,
  timeoutMs: number,
): Promise<HomeFeedCardSnapshot[]> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: async () => {
              const playwright = await import("playwright");
              return playwright.request.newContext({
                baseURL: githubHomeUrl,
                storageState,
                extraHTTPHeaders: {
                  Accept: "text/html, application/xhtml+xml",
                  "Turbo-Frame": "conduit-feed-frame",
                  "User-Agent": "rss-summary",
                },
              });
            },
            catch: asError,
          }),
          (requestContext) => Effect.promise(() => requestContext.dispose()),
        );
        const response = yield* Effect.tryPromise({
          try: () => context.get(conduitFeedPath, { timeout: timeoutMs }),
          catch: asError,
        });
        if (!response.ok()) {
          return yield* Effect.fail(
            new Error(`GitHub conduit feed returned ${response.status()}.`),
          );
        }
        const html = yield* Effect.tryPromise({ try: () => response.text(), catch: asError });
        return extractHomeFeedSnapshotsFromHtml(html);
      }),
    ),
  );
}

export function readRenderedSnapshots(
  storageState: string,
  timeoutMs: number,
  options: BrowserOptions,
): Promise<HomeFeedCardSnapshot[]> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const browser = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: async () => {
              const playwright = await import("playwright");
              return launchBrowser(playwright, options);
            },
            catch: asError,
          }),
          (launched) => Effect.promise(() => launched.close()),
        );
        const context = yield* Effect.tryPromise({
          try: () => browser.newContext({ storageState }),
          catch: asError,
        });
        const page = yield* Effect.tryPromise({ try: () => context.newPage(), catch: asError });
        yield* Effect.tryPromise({
          try: () =>
            page.goto(githubHomeUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }),
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
    ),
  );
}

export function saveLoginStorageState(options: {
  storageState: string;
  browserChannel?: string;
}): Promise<void> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const browser = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: async () => {
              const playwright = await import("playwright");
              return launchBrowser(playwright, {
                headless: false,
                browserChannel: options.browserChannel ?? "chrome",
              });
            },
            catch: asError,
          }),
          (launched) => Effect.promise(() => launched.close()),
        );
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
    ),
  );
}

async function launchBrowser(
  playwright: typeof import("playwright"),
  options: BrowserOptions,
): Promise<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>> {
  try {
    return await playwright.chromium.launch({
      headless: options.headless,
      channel: options.browserChannel,
    });
  } catch (error) {
    if (!options.browserChannel) throw error;
    return playwright.chromium.launch({ headless: options.headless });
  }
}

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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
/* v8 ignore stop */
