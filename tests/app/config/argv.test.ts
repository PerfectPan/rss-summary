import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { parseCliArgs } from "../../../src/app/config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../../src/app/config/env.js";

async function resolveConfig(env: NodeJS.ProcessEnv, argv: string[]) {
  const config = await Effect.runPromise(loadEnvConfig(env));
  return applyCliArgs(config, parseCliArgs(argv));
}

describe("app/config/argv", () => {
  it("parses kebab-case flags into camelCase keys", () => {
    expect(
      parseCliArgs([
        "--dry-run",
        "--json",
        "--only-new",
        "--rss-only",
        "--state-file",
        ".state/test.json",
        "--run-log-dir",
        ".state/test-runs",
      ]),
    ).toEqual({
      dryRun: true,
      json: true,
      onlyNew: true,
      rssOnly: true,
      stateFile: ".state/test.json",
      runLogDir: ".state/test-runs",
    });
  });

  it("loads state and output options from args", async () => {
    const config = await resolveConfig({}, [
      "--json",
      "--only-new",
      "--rss-only",
      "--state-file",
      ".state/test.json",
      "--run-log-dir",
      ".state/test-runs",
      "--dry-run",
    ]);

    expect(config.outputFormat).toBe("json");
    expect(config.onlyNew).toBe(true);
    expect(config.rssOnly).toBe(true);
    expect(config.stateFile).toBe(".state/test.json");
    expect(config.runLogDir).toBe(".state/test-runs");
    expect(config.webhookUrl).toBeUndefined();
  });

  it("loads a bounded paper research queue size", async () => {
    expect((await resolveConfig({}, ["--dry-run"])).maxPapers).toBe(8);
    expect((await resolveConfig({ FEED_MAX_PAPERS: "5" }, ["--dry-run"])).maxPapers).toBe(5);
    expect((await resolveConfig({}, ["--max-papers", "3", "--dry-run"])).maxPapers).toBe(3);
    expect((await resolveConfig({ FEED_MAX_PAPERS: "50" }, ["--dry-run"])).maxPapers).toBe(8);
  });

  it("loads a calendar-day window from args", async () => {
    const config = await resolveConfig({}, [
      "--day",
      "2026-06-27",
      "--timezone-offset",
      "+08:00",
      "--dry-run",
    ]);

    expect(config.day).toBe("2026-06-27");
    expect(config.timezoneOffset).toBe("+08:00");
  });

  it("loads an explicit window from args", async () => {
    const config = await resolveConfig({}, [
      "--since",
      "2026-06-27T09:00:00+08:00",
      "--until",
      "2026-06-28T09:00:00+08:00",
      "--dry-run",
    ]);

    expect(config.since).toBe("2026-06-27T09:00:00+08:00");
    expect(config.until).toBe("2026-06-28T09:00:00+08:00");
  });

  it("rejects invalid argument-driven enum values with the historical messages", async () => {
    await expect(resolveConfig({}, ["--github-feed-source", "timeline"])).rejects.toThrow(
      "GITHUB_FEED_SOURCE must be either 'home' or 'events'.",
    );
    await expect(resolveConfig({}, ["--github-home-fetch", "proxy"])).rejects.toThrow(
      "GITHUB_HOME_FETCH must be either 'conduit' or 'browser'.",
    );
  });
});
