import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { GitHubCatalog } from "../acquisition/index.js";
import { FeedStateStore } from "../delivery/index.js";
import { HttpReader, readOriginal } from "../reading/index.js";
import { AppLive, appLiveOptions, AppLiveFromEnv, ReadingLive } from "./layers.js";
import { applyCliArgs, loadEnvConfig } from "./config/env.js";
import { parseCliArgs } from "./config/argv.js";

describe("app/layers", () => {
  it("assembles acquisition, delivery and reading services", async () => {
    const services = await Effect.runPromise(
      Effect.provide(Effect.all([GitHubCatalog, FeedStateStore, HttpReader]), AppLive()),
    );
    expect(services).toHaveLength(3);
  });

  it("derives layer options from a resolved configuration", async () => {
    const base = await Effect.runPromise(
      loadEnvConfig({
        GH_FEED_TOKEN: "token",
        GITHUB_HOME_FETCH: "browser",
        GITHUB_HOME_STORAGE_STATE: ".state/home.json",
        GITHUB_HOME_BROWSER_CHANNEL: "chromium",
        NOTIFY_WEBHOOK_URL: "https://example.com/hook",
        GLM_CODING_API_KEY: "glm",
      }),
    );
    const config = applyCliArgs(base, parseCliArgs([]));
    expect(appLiveOptions(config)).toMatchObject({
      acquisition: {
        token: "token",
        githubHome: {
          storageState: ".state/home.json",
          fetchMode: "browser",
          browserChannel: "chromium",
        },
      },
      delivery: { webhookUrl: "https://example.com/hook" },
      reading: { apiKey: "glm" },
    });
  });

  it("builds AppLiveFromEnv from the ambient environment", async () => {
    const services = await Effect.runPromise(Effect.provide(GitHubCatalog, AppLiveFromEnv));
    expect(typeof services.getRepository).toBe("function");
  });

  it("wires HTTP extraction for an explicit http read", async () => {
    const result = await Effect.runPromise(
      readOriginal({
        glmFallback: false,
        mode: "http",
        ref: "article:1",
        url: "https://example.com/article",
      }).pipe(
        Effect.provide(
          ReadingLive({
            fetch: async () =>
              new Response(
                `<article><h1>Useful article</h1><p>${"Grounded content. ".repeat(10)}</p></article>`,
                { headers: { "content-type": "text/html" } },
              ),
            now: () => new Date("2026-08-17T01:00:00.000Z"),
          }),
        ),
      ),
    );
    expect(result).toMatchObject({
      fetchedUrl: "https://example.com/article",
      method: "http",
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "ok",
      title: "Useful article",
    });
  });
});
