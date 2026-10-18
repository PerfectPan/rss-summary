import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { GitHubCatalog } from "../../src/acquisition/index.js";
import { FeedStateStore } from "../../src/delivery/index.js";
import { HttpReader } from "../../src/reading/index.js";
import { AppLive, appLiveOptions, AppLiveFromEnv } from "../../src/app/layers.js";
import { applyCliArgs, loadEnvConfig } from "../../src/app/config/env.js";
import { parseCliArgs } from "../../src/app/config/argv.js";

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
});
