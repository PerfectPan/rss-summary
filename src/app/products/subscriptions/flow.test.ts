import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { listRunArtifacts } from "../../../delivery/index.js";
import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../config/env.js";
import { AppLive, appLiveOptions } from "../../layers.js";

// The notifier writes to stdout; capture it instead of mocking the old module.
let restoreStdout: (() => void) | undefined;
const sentOutputs: string[] = [];

async function resolveTestConfig(stateFile: string) {
  const base = await Effect.runPromise(
    loadEnvConfig({
      GITHUB_USERNAME: "PerfectPan",
      RSS_FEEDS: JSON.stringify([
        { name: "Example Feed", url: "https://example.com/feed", tags: ["ai"] },
      ]),
    }),
  );
  return applyCliArgs(
    base,
    parseCliArgs([
      "--only-new",
      "--since",
      "2026-07-14T00:00:00+08:00",
      "--until",
      "2026-07-15T00:00:00+08:00",
      "--state-file",
      stateFile,
    ]),
  );
}

function captureStdout(): void {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    sentOutputs.push(String(chunk));
    return true;
  });
  restoreStdout = () => spy.mockRestore();
}

vi.mock("../../../acquisition/infra/adapters/github-home-browser.js", () => ({
  GitHubHomeClient: class {
    getHomeEvents(): Promise<never> {
      return Promise.reject(new Error("home unavailable"));
    }
  },
  saveGithubHomeStorageState: vi.fn(),
}));

vi.mock("../../../acquisition/infra/adapters/rss-http.js", () => ({
  RssClient: class {
    getFeedEvents(): Promise<Array<Record<string, unknown>>> {
      return Promise.resolve([
        {
          id: "rss:https://example.com/feed:https://example.com/post",
          type: "article",
          source: "rss",
          actor: "Example Feed",
          repo: "rss:https://example.com/post",
          createdAt: "2026-07-14T01:00:00.000Z",
          action: "published",
          htmlUrl: "https://example.com/post",
          title: "RSS survives GitHub outage",
          sourceName: "Example Feed",
          sourceUrl: "https://example.com/feed",
          tags: ["ai"],
        },
      ]);
    }
  },
}));

describe("digest source isolation", () => {
  afterEach(() => {
    sentOutputs.length = 0;
    restoreStdout?.();
    restoreStdout = undefined;
    vi.unstubAllEnvs();
  });

  it("keeps RSS candidates when GitHub Home is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "rss-summary-run-log-"));
    vi.stubEnv(
      "RSS_FEEDS",
      JSON.stringify([{ name: "Example Feed", url: "https://example.com/feed", tags: ["ai"] }]),
    );
    vi.stubEnv("FEED_RUN_LOG_DIR", join(root, "runs"));
    process.argv = [
      "node",
      "rss-summary",
      "digest",
      "--dry-run",
      "--json",
      "--since",
      "2026-07-14T00:00:00+08:00",
      "--until",
      "2026-07-15T00:00:00+08:00",
    ];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    captureStdout();

    const { digestView, renderJsonDigest } = await import("../../render/layouts/digest.js");
    const { renderViewMarkdown } = await import("../../render/markdown.js");

    try {
      const base = await Effect.runPromise(loadEnvConfig());
      const config = applyCliArgs(
        base,
        parseCliArgs([
          "--dry-run",
          "--json",
          "--since",
          "2026-07-14T00:00:00+08:00",
          "--until",
          "2026-07-15T00:00:00+08:00",
        ]),
      );
      const { runSubscriptionFlow } = await import("./flow.js");
      await Effect.runPromise(
        Effect.provide(
          runSubscriptionFlow(config, (document, format) =>
            format === "json"
              ? renderJsonDigest(document)
              : renderViewMarkdown(digestView(document)),
          ),
          AppLive(appLiveOptions(config)),
        ),
      );

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("GitHub feed unavailable"));
      expect(sentOutputs.join("")).toContain("RSS survives GitHub outage");
      expect(listRunArtifacts(join(root, "runs"))).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("builds a document without delivering or writing seen state", async () => {
    const root = await mkdtemp(join(tmpdir(), "rss-summary-rivus-"));
    const stateFile = join(root, "feed-state.json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const config = await resolveTestConfig(stateFile);
      const { buildDigestDocument } = await import("./flow.js");

      const document = await Effect.runPromise(
        Effect.provide(buildDigestDocument(config), AppLive(appLiveOptions(config))),
      );

      expect(document.candidates).toHaveLength(1);
      expect(sentOutputs).toHaveLength(0);
      expect(existsSync(stateFile)).toBe(false);
    } finally {
      errorSpy.mockRestore();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not let research cache suppress a new subscription event", async () => {
    const root = await mkdtemp(join(tmpdir(), "rss-summary-researched-"));
    const stateFile = join(root, "feed-state.json");
    await writeFile(
      stateFile,
      JSON.stringify({
        seen: {},
        researched: {
          "rss:https://example.com/post": { at: "2026-07-13T00:00:00Z", decision: "read" },
        },
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const config = await resolveTestConfig(stateFile);
      const { buildDigestDocument } = await import("./flow.js");

      const document = await Effect.runPromise(
        Effect.provide(buildDigestDocument(config), AppLive(appLiveOptions(config))),
      );

      expect(document.candidates).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
      await rm(root, { force: true, recursive: true });
    }
  });
});
