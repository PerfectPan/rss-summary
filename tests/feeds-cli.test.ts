import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ActivityCard } from "../src/domain.js";
import { runFeedsCommand } from "../src/feeds.js";

describe("feeds CLI", () => {
  it("adds and lists RSS feeds through a file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "rss-summary-feeds-")), "feeds.json");
    const output: string[] = [];

    const exitCode = await runFeedsCommand(
      ["add", "--file", file, "--name", "GitHub Blog", "--url", "https://github.blog/feed", "--tags", "github,ai"],
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
    await runFeedsCommand(["add", "--file", file, "--name", "GitHub Blog", "--url", "https://github.blog/feed"], {
      stdout: { write: () => undefined },
    });
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
});
