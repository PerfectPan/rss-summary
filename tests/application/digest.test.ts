import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { loadConfig } from "../../src/infrastructure/config.js";
import { listRunArtifacts } from "../../src/infrastructure/run-store.js";

const sentOutputs: string[] = [];

vi.mock("../../src/infrastructure/github-home.js", () => ({
  GitHubHomeClient: class {
    getHomeEvents(): Promise<never> {
      return Promise.reject(new Error("home unavailable"));
    }
  },
}));

vi.mock("../../src/infrastructure/rss.js", () => ({
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

vi.mock("../../src/infrastructure/notifier.js", () => ({
  createNotifier: () => ({
    send: (output: string) => {
      sentOutputs.push(output);
      return Promise.resolve();
    },
  }),
}));

describe("digest source isolation", () => {
  afterEach(() => {
    sentOutputs.length = 0;
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

    const { run } = await import("../../src/application/digest.js");
    const { renderMarkdownDigest, renderJsonDigest } =
      await import("../../src/presentation/render.js");

    try {
      await Effect.runPromise(
        run((document, format) =>
          format === "json" ? renderJsonDigest(document) : renderMarkdownDigest(document),
        ),
      );

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("GitHub feed unavailable"));
      expect(sentOutputs).toHaveLength(1);
      expect(sentOutputs[0]).toContain("RSS survives GitHub outage");
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
      const config = loadConfig(
        {
          GITHUB_USERNAME: "PerfectPan",
          RSS_FEEDS: JSON.stringify([
            { name: "Example Feed", url: "https://example.com/feed", tags: ["ai"] },
          ]),
        },
        [
          "--only-new",
          "--since",
          "2026-07-14T00:00:00+08:00",
          "--until",
          "2026-07-15T00:00:00+08:00",
          "--state-file",
          stateFile,
        ],
      );
      const { buildDigestDocument } = await import("../../src/application/digest.js");

      const document = await Effect.runPromise(buildDigestDocument(config));

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
      const config = loadConfig(
        {
          GITHUB_USERNAME: "PerfectPan",
          RSS_FEEDS: JSON.stringify([
            { name: "Example Feed", url: "https://example.com/feed", tags: ["ai"] },
          ]),
        },
        [
          "--only-new",
          "--since",
          "2026-07-14T00:00:00+08:00",
          "--until",
          "2026-07-15T00:00:00+08:00",
          "--state-file",
          stateFile,
        ],
      );
      const { buildDigestDocument } = await import("../../src/application/digest.js");

      const document = await Effect.runPromise(buildDigestDocument(config));

      expect(document.candidates).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
      await rm(root, { force: true, recursive: true });
    }
  });
});
