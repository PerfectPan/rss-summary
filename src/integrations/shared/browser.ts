import { Effect } from "effect";

/**
 * Playwright lives here and nowhere else: every service that needs a real
 * browser (GitHub Home's rendered feed and login, the article reader) launches
 * Chromium through this module so channel fallback, context options, and page
 * lifecycle stay in one place. The launch helpers return scoped resources —
 * pair them with `Effect.scoped` at the call site.
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

/** A launched Chromium inside the caller's scope. */
export function launchBrowser(options: BrowserLaunchOptions) {
  return Effect.gen(function* () {
    const playwright = yield* Effect.promise(() => import("playwright"));
    return yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => launchChromium(playwright, options),
        catch: asBrowserError,
      }),
      (launched) => Effect.promise(() => launched.close()),
    );
  });
}

function asBrowserError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** One page in a fresh context inside the caller's scope. */
export function openPage(options: {
  browserChannel?: string;
  headless: boolean;
  context?: Record<string, unknown>;
}) {
  return Effect.gen(function* () {
    const browser = yield* launchBrowser(options);
    const context = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => browser.newContext(options.context ?? {}),
        catch: asBrowserError,
      }),
      (context) => Effect.promise(() => context.close()),
    );
    return yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => context.newPage(),
        catch: asBrowserError,
      }),
      (page) => Effect.promise(() => page.close()),
    );
  });
}

/** An HTTP-only API request context inside the caller's scope. */
export function openRequestContext(options: {
  baseURL: string;
  storageState?: string;
  extraHTTPHeaders?: Record<string, string>;
}) {
  return Effect.gen(function* () {
    const playwright = yield* Effect.promise(() => import("playwright"));
    return yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          playwright.request.newContext({
            baseURL: options.baseURL,
            ...(options.storageState ? { storageState: options.storageState } : {}),
            extraHTTPHeaders: options.extraHTTPHeaders ?? {},
          }),
        catch: asBrowserError,
      }),
      (context) => Effect.promise(() => context.dispose()),
    );
  });
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
      const page = yield* openPage({
        browserChannel: input.browserChannel,
        headless: input.headless,
        context: input.userAgent ? { userAgent: input.userAgent } : {},
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
