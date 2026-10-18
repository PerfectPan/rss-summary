import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import type { ActivityCard } from "../../../editorial/index.js";
import { runDigestCommand, runFeedsCommand } from "./cli.js";

describe("subscriptions digest CLI", () => {
  it("reports configuration errors on stderr with exit code 1", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "rss-summary-cli-"));
    const missingIndustry = join(temporaryDirectory, "missing-industry.json");
    const stderr: string[] = [];

    try {
      const previous = process.env.INDUSTRY_SOURCES_FILE;
      process.env.INDUSTRY_SOURCES_FILE = missingIndustry;
      const code = await runDigestCommand([], {
        stderr: { write: (chunk) => stderr.push(String(chunk)) },
      });
      process.env.INDUSTRY_SOURCES_FILE = previous;

      expect(code).toBe(1);
      expect(stderr.join("")).toContain(
        `Industry source configuration file does not exist: ${missingIndustry}`,
      );
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});

describe("feeds CLI", () => {
  it("adds and lists RSS feeds through a file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "rss-summary-feeds-")), "feeds.json");
    const output: string[] = [];

    const exitCode = await runFeedsCommand(
      [
        "add",
        "--file",
        file,
        "--name",
        "GitHub Blog",
        "--url",
        "https://github.blog/feed",
        "--tags",
        "github,ai",
      ],
      { stdout: { write: (chunk) => output.push(String(chunk)) } },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([
      {
        name: "GitHub Blog",
        url: "https://github.blog/feed",
        tags: ["github", "ai"],
      },
    ]);

    output.length = 0;
    await runFeedsCommand(["list", "--file", file], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
    });

    expect(output.join("")).toContain("GitHub Blog\thttps://github.blog/feed\tgithub, ai");
  });

  it("tests configured feeds without mutating the file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "rss-summary-feeds-")), "feeds.json");
    await runFeedsCommand(
      ["add", "--file", file, "--name", "GitHub Blog", "--url", "https://github.blog/feed"],
      {
        stdout: { write: () => undefined },
      },
    );
    const before = readFileSync(file, "utf8");
    const output: string[] = [];

    const exitCode = await runFeedsCommand(["test", "--file", file], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
      rssClient: {
        async getFeedEvents(): Promise<ActivityCard[]> {
          return [
            {
              id: "rss:test:1",
              type: "article",
              source: "rss",
              actor: "GitHub Blog",
              repo: "rss:https://github.blog/post",
              createdAt: "2026-06-27T00:00:00.000Z",
            },
          ];
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(output.join("")).toContain("GitHub Blog: ok, 1 item");
  });

  it("removes feeds by URL through remove and delete aliases", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "rss-summary-feeds-")), "feeds.json");
    const silent = { stdout: { write: () => undefined } };

    await runFeedsCommand(
      ["add", "--file", file, "--name", "GitHub Blog", "--url", "https://github.blog/feed"],
      silent,
    );
    await runFeedsCommand(
      ["add", "--file", file, "--name", "Deno Blog", "--url", "https://deno.com/feed"],
      silent,
    );

    const removeExitCode = await runFeedsCommand(
      ["remove", "--file", file, "--url", "https://github.blog/feed"],
      silent,
    );
    expect(removeExitCode).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([
      {
        name: "Deno Blog",
        url: "https://deno.com/feed",
        tags: [],
      },
    ]);

    const deleteExitCode = await runFeedsCommand(
      ["delete", "--file", file, "--url", "https://deno.com/feed"],
      silent,
    );
    expect(deleteExitCode).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("prints the Node read error and exits 1 when the feeds path is a directory", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rss-summary-feeds-"));
    const stderr: string[] = [];
    const exitCode = await runFeedsCommand(["list", "--file", directory], {
      stderr: { write: (chunk) => stderr.push(String(chunk)) },
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toBe(`${nodeMessage(() => readFileSync(directory, "utf8"))}\n`);
  });

  it("prints the Node write error and exits 1 when the feeds file cannot be written", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rss-summary-feeds-"));
    const file = join(directory, "feeds.json");
    chmodSync(directory, 0o555);
    const stderr: string[] = [];
    try {
      const exitCode = await runFeedsCommand(
        ["add", "--file", file, "--name", "Example", "--url", "https://example.com/feed.xml"],
        { stderr: { write: (chunk) => stderr.push(String(chunk)) } },
      );
      expect(exitCode).toBe(1);
      expect(stderr.join("")).toBe(`${historicalSaveMessage(file)}\n`);
    } finally {
      chmodSync(directory, 0o755);
    }
  });
});

function historicalSaveMessage(path: string): string {
  return nodeMessage(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "unused");
  });
}

function nodeMessage(readOrWrite: () => void): string {
  try {
    readOrWrite();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the Node filesystem call to fail");
}
