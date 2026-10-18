import { Effect } from "effect";

/**
 * Playwright lives here and nowhere else: every service that needs a real
 * browser (GitHub Home's rendered feed and login, the article reader) launches
 * Chromium through this module so channel fallback, context options, and page
 * lifecycle stay in one place.
 */
export type BrowserLaunchOptions = {
  browserChannel?: string;
  headless: boolean;
};

export async function launchChromium(
  playwright: typeof import("playwright"),
  options: BrowserLaunchOptions,
): Promise<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>> {
  try {
    return await playwright.chromium.launch({
      channel: options.browserChannel,
      headless: options.headless,
    });
  } catch (error) {
    if (!options.browserChannel) throw error;
    return playwright.chromium.launch({ headless: options.headless });
  }
}

export type RenderedPage = { html: string; url: string };

export type RenderPageOptions = {
  browserChannel?: string;
  headless: boolean;
  timeoutMs: number;
  url: string;
  /** Optional content selector to wait for before settling. */
  waitForSelector?: string;
  userAgent?: string;
};

/** Render one page in an isolated context and return its final HTML and URL. */
export function renderPage(input: RenderPageOptions): Effect.Effect<RenderedPage, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      const playwright = yield* Effect.promise(() => import("playwright"));
      const browser = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => launchChromium(playwright, input),
          catch: (cause) => cause,
        }),
        (launched) => Effect.promise(() => launched.close()),
      );
      const context = yield* Effect.tryPromise({
        try: () =>
          browser.newContext({
            ...(input.userAgent ? { userAgent: input.userAgent } : {}),
          }),
        catch: (cause) => cause,
      });
      const page = yield* Effect.tryPromise({
        try: () => context.newPage(),
        catch: (cause) => cause,
      });
      yield* Effect.tryPromise({
        try: () => page.goto(input.url, { timeout: input.timeoutMs, waitUntil: "commit" }),
        catch: (cause) => cause,
      });
      const selector = input.waitForSelector;
      if (selector) {
        yield* Effect.tryPromise({
          try: () =>
            page.waitForSelector(selector, { timeout: input.timeoutMs }).catch(() => undefined),
          catch: (cause) => cause,
        });
      }
      yield* Effect.tryPromise({
        try: () =>
          page
            .waitForLoadState("networkidle", { timeout: Math.min(input.timeoutMs, 5_000) })
            .catch(() => undefined),
        catch: (cause) => cause,
      });
      const html = yield* Effect.tryPromise({
        try: () => page.content(),
        catch: (cause) => cause,
      });
      return { html, url: page.url() };
    }),
  );
}
