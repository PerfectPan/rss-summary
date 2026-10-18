import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { generateRivusNewsBrief } from "../products/news/flow.js";
import { loadNewsTopics } from "../products/news/topics.js";
import { generateDailyAiDigest } from "../products/daily-ai/flow.js";
import type { IndustryBriefDocument } from "../products/shared/industry.js";
import type { XAccountPosts } from "../../acquisition/index.js";
import { applyCliArgs, loadEnvConfig, type AppConfig } from "./env.js";
import { parseCliArgs } from "./argv.js";

const newsTopics = [
  {
    id: "tools",
    label: "开发工具",
    icon: "💻",
    enabled: true,
    maxItems: 2,
    sourcePolicy: "news" as const,
    queries: [
      {
        id: "typescript",
        text: "TypeScript release",
        intent: "developer-change" as const,
        subjectAny: ["TypeScript"],
        eventAny: ["release"],
        excludedAny: [],
      },
    ],
  },
];

const newsInput = { edition: "noon" as const, occurrence: "2026-10-18T04:00:00.000Z" };

async function runNewsBrief(env: NodeJS.ProcessEnv) {
  return Effect.runPromise(
    generateRivusNewsBrief(newsInput, {
      env,
      topics: newsTopics,
      search: async () => ({ resultCount: 0, results: [] }),
    }),
  );
}

async function resolveConfig(env: NodeJS.ProcessEnv, argv: string[] = []): Promise<AppConfig> {
  const config = await Effect.runPromise(loadEnvConfig(env));
  return applyCliArgs(config, parseCliArgs(argv));
}

describe("app/config/env", () => {
  it("includes RSS feeds from the repository feeds.json by default", async () => {
    const config = await resolveConfig({}, ["--dry-run"]);
    const expected = JSON.parse(
      readFileSync(new URL("../../../feeds.json", import.meta.url), "utf8"),
    );

    expect(config.rssFeeds.map((feed) => feed.url)).toEqual(
      expected.map((feed: { url: string }) => feed.url),
    );
  });

  it("loads packaged industry sources independently of the process working directory", async () => {
    const originalWorkingDirectory = process.cwd();
    const unrelatedWorkingDirectory = mkdtempSync(join(tmpdir(), "rss-summary-config-"));

    try {
      process.chdir(unrelatedWorkingDirectory);
      const config = await resolveConfig({}, ["--dry-run"]);
      const expectedSources = JSON.parse(
        readFileSync(new URL("../../../industry-feeds.json", import.meta.url), "utf8"),
      );

      expect(config.industrySources.map((source) => source.url)).toEqual(
        expectedSources.map((source: { url: string }) => source.url),
      );
    } finally {
      process.chdir(originalWorkingDirectory);
      rmSync(unrelatedWorkingDirectory, { force: true, recursive: true });
    }
  });

  it("rejects an explicit industry source file that does not exist", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "rss-summary-config-"));
    const missingFile = join(temporaryDirectory, "missing-industry-feeds.json");

    try {
      await expect(
        Effect.runPromise(loadEnvConfig({ INDUSTRY_SOURCES_FILE: missingFile })),
      ).rejects.toThrow(`Industry source configuration file does not exist: ${missingFile}`);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("allows RSS feed subscriptions from env", async () => {
    const config = await resolveConfig(
      {
        RSS_FEEDS:
          '[{"name":"Vercel Blog","url":"https://vercel.com/blog/rss.xml","tags":["nextjs"]}]',
      },
      ["--dry-run"],
    );

    expect(config.rssFeeds).toEqual([
      {
        name: "Vercel Blog",
        url: "https://vercel.com/blog/rss.xml",
        tags: ["nextjs"],
      },
    ]);
  });

  it("keeps personal and industry feed overrides isolated", async () => {
    const config = await resolveConfig(
      {
        INDUSTRY_SOURCES:
          '[{"name":"arXiv","url":"https://rss.arxiv.org/rss/cs.AI","tags":["Papers"]}]',
        RSS_FEEDS: '[{"name":"Personal","url":"https://example.com/personal.xml","tags":["Blog"]}]',
      },
      ["--dry-run"],
    );

    expect(config.rssFeeds.map((feed) => feed.name)).toEqual(["Personal"]);
    expect(config.industrySources.map((feed) => feed.name)).toEqual(["arXiv"]);
  });

  it("keeps the legacy industry feed override as an alias", async () => {
    const config = await resolveConfig(
      { INDUSTRY_FEEDS: '[{"name":"Legacy","url":"https://example.com/feed.xml"}]' },
      ["--dry-run"],
    );

    expect(config.industrySources.map((source) => source.name)).toEqual(["Legacy"]);
  });

  it("uses GitHub Home as the default GitHub feed source", async () => {
    const config = await resolveConfig({}, ["--dry-run"]);

    expect(config.githubFeedSource).toBe("home");
    expect(config.githubHomeFetch).toBe("conduit");
    expect(config.githubHomeStorageState).toBe(".state/github-home-storage.json");
    expect(config.eventPages).toBe(3);
    expect(config.perPage).toBe(100);
    expect(config.windowHours).toBe(36);
    expect(config.maxRepos).toBe(30);
    expect(config.maxPapers).toBe(8);
    expect(config.username).toBe("PerfectPan");
    expect(config.token).toBeUndefined();
    expect(config.webhookUrl).toBeUndefined();
    expect(config.outputFormat).toBe("markdown");
    expect(config.stateFile).toBe(".state/feed-state.json");
    expect(config.industryStateFile).toBe(".state/industry-state.json");
    expect(config.runLogDir).toBe(".state/runs");
    expect(config.interests.slice(0, 4)).toEqual(["agent", "coding-agent", "llm", "mcp"]);
  });

  it("reads GitHub identity, tokens and feed source overrides", async () => {
    const config = await resolveConfig({
      GITHUB_USERNAME: "nyx-cell",
      GH_FEED_TOKEN: "feed-token",
      GITHUB_FEED_SOURCE: "events",
      GITHUB_HOME_FETCH: "browser",
      GITHUB_HOME_STORAGE_STATE: ".state/custom-home.json",
      GITHUB_HOME_BROWSER_CHANNEL: "chromium",
    });

    expect(config.username).toBe("nyx-cell");
    expect(config.token).toBe("feed-token");
    expect(config.githubFeedSource).toBe("events");
    expect(config.githubHomeFetch).toBe("browser");
    expect(config.githubHomeStorageState).toBe(".state/custom-home.json");
    expect(config.githubHomeBrowserChannel).toBe("chromium");
  });

  it("falls back to GH_USERNAME and GITHUB_TOKEN and keeps empty strings literal", async () => {
    const fallback = await resolveConfig({ GH_USERNAME: "fallback", GITHUB_TOKEN: "generic" });
    expect(fallback.username).toBe("fallback");
    expect(fallback.token).toBe("generic");

    // `??` chains keep an empty GH_FEED_TOKEN instead of falling through.
    const empty = await resolveConfig({ GH_FEED_TOKEN: "", GITHUB_TOKEN: "generic" });
    expect(empty.token).toBe("");
  });

  it("rejects invalid GitHub feed and home fetch values with the historical messages", async () => {
    await expect(
      Effect.runPromise(loadEnvConfig({ GITHUB_FEED_SOURCE: "timeline" })),
    ).rejects.toThrow("GITHUB_FEED_SOURCE must be either 'home' or 'events'.");
    await expect(Effect.runPromise(loadEnvConfig({ GITHUB_HOME_FETCH: "proxy" }))).rejects.toThrow(
      "GITHUB_HOME_FETCH must be either 'conduit' or 'browser'.",
    );
  });

  it("suppresses the webhook while dry-run is requested through the environment", async () => {
    const live = await resolveConfig({ NOTIFY_WEBHOOK_URL: "https://example.com/hook" });
    expect(live.webhookUrl).toBe("https://example.com/hook");

    const dry = await resolveConfig({
      NOTIFY_WEBHOOK_URL: "https://example.com/hook",
      DRY_RUN: "true",
    });
    expect(dry.webhookUrl).toBeUndefined();
    expect(dry.dryRun).toBe(true);
  });

  it("reads output format, only-new and rss-only flags from the environment", async () => {
    const config = await resolveConfig({
      FEED_OUTPUT_FORMAT: "json",
      FEED_ONLY_NEW: "true",
      FEED_RSS_ONLY: "1",
    });

    expect(config.outputFormat).toBe("json");
    expect(config.onlyNew).toBe(true);
    expect(config.rssOnly).toBe(true);
  });

  it("bounds numeric tuning values by falling back on invalid input", async () => {
    const config = await resolveConfig({
      FEED_EVENT_PAGES: "0",
      FEED_PER_PAGE: "not-a-number",
      FEED_WINDOW_HOURS: "-3",
      FEED_MAX_REPOS: "abc",
      FEED_MAX_PAPERS: "50",
    });

    expect(config.eventPages).toBe(3);
    expect(config.perPage).toBe(100);
    expect(config.windowHours).toBe(36);
    expect(config.maxRepos).toBe(30);
    expect(config.maxPapers).toBe(8);
  });

  it("applies explicit interests and window values", async () => {
    const config = await resolveConfig({
      FEED_INTERESTS: "rust, vite , deno",
      FEED_SINCE: "2026-06-27T09:00:00+08:00",
      FEED_UNTIL: "2026-06-28T09:00:00+08:00",
      FEED_DAY: "2026-06-27",
      FEED_TIMEZONE_OFFSET: "-05:00",
      FEED_STATE_FILE: ".state/custom.json",
      INDUSTRY_STATE_FILE: ".state/industry-custom.json",
      FEED_RUN_LOG_DIR: ".state/runs-custom",
    });

    expect(config.interests).toEqual(["rust", "vite", "deno"]);
    expect(config.since).toBe("2026-06-27T09:00:00+08:00");
    expect(config.until).toBe("2026-06-28T09:00:00+08:00");
    expect(config.day).toBe("2026-06-27");
    expect(config.timezoneOffset).toBe("-05:00");
    expect(config.stateFile).toBe(".state/custom.json");
    expect(config.industryStateFile).toBe(".state/industry-custom.json");
    expect(config.runLogDir).toBe(".state/runs-custom");
  });

  it("reads the GLM key and article research defaults with their bounds", async () => {
    const config = await resolveConfig({});
    expect(config.glmCodingApiKey).toBe("");
    expect(config.articleResearch).toEqual({
      browserChannel: "chrome",
      browserHeadless: true,
      browserTimeoutMs: 30_000,
      glmFallback: false,
    });

    const configured = await resolveConfig({
      GLM_CODING_API_KEY: "glm-key",
      RSS_ARTICLE_BROWSER_CHANNEL: "chromium",
      RSS_ARTICLE_BROWSER_HEADLESS: "false",
      RSS_ARTICLE_BROWSER_TIMEOUT_MS: "4500",
      RSS_ARTICLE_GLM_FALLBACK: "true",
    });
    expect(configured.glmCodingApiKey).toBe("glm-key");
    expect(configured.articleResearch).toEqual({
      browserChannel: "chromium",
      browserHeadless: false,
      browserTimeoutMs: 30_000,
      glmFallback: true,
    });

    const long = await resolveConfig({ RSS_ARTICLE_BROWSER_TIMEOUT_MS: "60000" });
    expect(long.articleResearch.browserTimeoutMs).toBe(60_000);
  });
});

describe("app/config/env news variables", () => {
  it("accepts every documented NEWS_SEARCH_MODE value and rejects others with the historical message", async () => {
    for (const mode of ["doubao", "hybrid", "combined", "grok"]) {
      await expect(
        runNewsBrief({ NEWS_SEARCH_MODE: mode, GLM_CODING_API_KEY: "key" }),
      ).resolves.toBeTruthy();
    }
    await expect(runNewsBrief({ NEWS_SEARCH_MODE: "web" })).rejects.toThrow(
      "NEWS_SEARCH_MODE must be doubao, hybrid, combined or grok.",
    );
  });

  it("bounds NEWS_SEARCH_COUNT_PER_QUERY and NEWS_SEARCH_MAX_QUERIES", async () => {
    await expect(runNewsBrief({ NEWS_SEARCH_COUNT_PER_QUERY: "0" })).rejects.toThrow(
      "Numeric configuration must be an integer between 1 and 50.",
    );
    await expect(runNewsBrief({ NEWS_SEARCH_MAX_QUERIES: "0" })).rejects.toThrow(
      "Numeric configuration must be an integer between 1 and 32.",
    );
    await expect(
      runNewsBrief({ NEWS_SEARCH_MODE: "grok", NEWS_GROK_MAX_QUERIES: "9" }),
    ).rejects.toThrow("Numeric configuration must be an integer between 1 and 4.");
  });

  it("validates the Grok CLI settings before any search runs", async () => {
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_SEARCH_MODE: "grok", NEWS_GROK_MODEL: "bad model" },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("Invalid NEWS_GROK_MODEL.");
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_SEARCH_MODE: "grok", NEWS_GROK_TIMEOUT_MS: "10" },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 1000 and 180000.");
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_SEARCH_MODE: "grok", NEWS_SEARCH_DAILY_LIMIT: "x" },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 0 and 100000.");
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_SEARCH_MODE: "grok", NEWS_SEARCH_MONTHLY_LIMIT: "x" },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 0 and 1000000.");
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_SEARCH_MODE: "grok", NEWS_SEARCH_CACHE_TTL_MINUTES: "-1" },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 0 and 43200.");
  });

  it("requires a Doubao key with the historical message and bounds its timeout", async () => {
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_SEARCH_MODE: "doubao" },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("DOUBAO_SEARCH_API_KEY is required for news briefs.");
    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: {
            NEWS_SEARCH_MODE: "doubao",
            DOUBAO_SEARCH_API_KEY: "key",
            NEWS_SEARCH_TIMEOUT_MS: "10",
          },
          topics: newsTopics,
        }),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 1000 and 60000.");
  });

  it("bounds the hybrid GLM search and read budgets", async () => {
    await expect(
      runNewsBrief({
        NEWS_SEARCH_MODE: "hybrid",
        GLM_CODING_API_KEY: "key",
        NEWS_GLM_MAX_SEARCHES: "0",
      }),
    ).rejects.toThrow("Numeric configuration must be an integer between 1 and 64.");
    await expect(
      runNewsBrief({
        NEWS_SEARCH_MODE: "hybrid",
        GLM_CODING_API_KEY: "key",
        NEWS_GLM_MAX_READS: "0",
      }),
    ).rejects.toThrow("Numeric configuration must be an integer between 1 and 64.");
  });

  it("loads topics from NEWS_TOPICS_FILE and requires at least one enabled topic", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rss-summary-topics-"));
    const topicsFile = join(directory, "topics.json");
    try {
      writeFileSync(topicsFile, JSON.stringify(newsTopics));
      const result = await Effect.runPromise(
        generateRivusNewsBrief(newsInput, {
          env: { NEWS_TOPICS_FILE: topicsFile },
          search: async () => ({ resultCount: 0, results: [] }),
        }),
      );
      expect(result.topics.map(({ id }) => id)).toEqual(["tools"]);
      expect(loadNewsTopics(topicsFile)).toHaveLength(1);

      const disabled = join(directory, "disabled.json");
      writeFileSync(disabled, JSON.stringify([{ ...newsTopics[0], enabled: false }]));
      await expect(
        Effect.runPromise(
          generateRivusNewsBrief(newsInput, {
            env: { NEWS_TOPICS_FILE: disabled },
            search: async () => ({ resultCount: 0, results: [] }),
          }),
        ),
      ).rejects.toThrow("At least one news topic must be enabled.");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("rejects an invalid timezone offset with the historical message", async () => {
    await expect(runNewsBrief({ FEED_TIMEZONE_OFFSET: "nope" })).rejects.toThrow(
      "FEED_TIMEZONE_OFFSET must use +HH:MM or -HH:MM format.",
    );
  });
});

describe("app/config/env daily-ai and video variables", () => {
  const occurrence = "2026-08-11T01:00:00.000Z";
  const official: IndustryBriefDocument = {
    generatedAt: occurrence,
    candidates: [
      {
        repo: "rss:openai",
        source: "rss" as const,
        category: "release" as const,
        score: 80,
        actors: ["OpenAI"],
        eventTypes: ["release"],
        reasons: [],
        events: [
          {
            id: "rss-1",
            type: "release" as const,
            source: "rss" as const,
            actor: "OpenAI",
            repo: "rss:openai",
            createdAt: "2026-08-10T02:00:00Z",
            title: "OpenAI 发布 Codex 2.0",
            htmlUrl: "https://openai.com/codex-2",
            sourceName: "OpenAI",
          },
        ],
        label: "OpenAI 发布 Codex 2.0",
        url: "https://openai.com/codex-2",
      },
    ],
  };

  it("defaults DAILY_AI_X_HANDLES to ClaudeDevs and treats empty as disabled", async () => {
    const xAccounts = vi.fn(
      async (_value: { handles: string[] }): Promise<XAccountPosts> => ({ posts: [], audit: [] }),
    );
    await generateDailyAiDigest(
      { occurrence },
      { env: {}, industry: async () => official, xAccounts },
    );
    expect(xAccounts.mock.calls[0]?.[0]).toMatchObject({ handles: ["ClaudeDevs"] });

    await generateDailyAiDigest(
      { occurrence },
      { env: { DAILY_AI_X_HANDLES: "" }, industry: async () => official, xAccounts },
    );
    expect(xAccounts.mock.calls[1]?.[0]).toMatchObject({ handles: [] });

    await generateDailyAiDigest(
      { occurrence },
      {
        env: { DAILY_AI_X_HANDLES: " ClaudeDevs, @OpenAI " },
        industry: async () => official,
        xAccounts,
      },
    );
    expect(xAccounts.mock.calls[2]?.[0]).toMatchObject({ handles: ["ClaudeDevs", "@OpenAI"] });
  });
});
