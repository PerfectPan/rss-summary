import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createEmptyFeedState, type RunAudit } from "../../../delivery/index.js";
import { loadEnvConfig, type AppConfig } from "../../config/env.js";
import { AppLive, appLiveOptions } from "../../layers.js";
import { runProductFlow } from "./flow.js";

describe("the shared product deliver flow", () => {
  it("renders and records the run log while a dry run skips the ledger", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "rss-summary-flow-"));
    try {
      const loaded = await Effect.runPromise(
        loadEnvConfig({
          FEED_RUN_LOG_DIR: temporaryDirectory,
          GITHUB_USERNAME: "PerfectPan",
          FEED_TIMEZONE_OFFSET: "+08:00"
        })
      );
      const config: AppConfig = { ...loaded, dryRun: true, outputFormat: "markdown" };
      const audit: RunAudit = {
        version: 2,
        runId: "test-run",
        product: "frontier",
        generatedAt: "2026-01-01T00:00:00Z",
        sources: [],
        counts: { fetched: 0, inWindow: 0, ranked: 0, selected: 0, researchPending: 0 },
        candidates: []
      };
      const document = { generatedAt: audit.generatedAt, candidates: [] };

      const rendered: string[] = [];
      await expect(
        Effect.runPromise(
          Effect.provide(
            runProductFlow(
              config,
              Effect.succeed({ audit, document, state: createEmptyFeedState() }),
              config.industryStateFile,
              () => [],
              (document, format) => {
                const output = `${document.generatedAt}:${format}`;
                rendered.push(output);
                return output;
              }
            ),
            AppLive(appLiveOptions(config))
          )
        )
      ).resolves.toBeUndefined();
      expect(rendered).toEqual(["2026-01-01T00:00:00Z:markdown"]);
      expect(existsSync(temporaryDirectory)).toBe(true);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
