import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { isCliEntrypoint, runCliCommand } from "../src/cli.js";

describe("top-level CLI", () => {
  it("routes feeds subcommands through the bin entrypoint", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "rss-summary-cli-")), "feeds.json");
    const output: string[] = [];

    const exitCode = await runCliCommand(
      ["feeds", "add", "--file", file, "--url", "https://github.blog/feed", "--name", "GitHub Blog"],
      { stdout: { write: (chunk) => output.push(String(chunk)) } },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([
      {
        name: "GitHub Blog",
        url: "https://github.blog/feed",
        tags: [],
      },
    ]);
    expect(output.join("")).toContain("Added GitHub Blog -> https://github.blog/feed");
  });

  it("recognizes npm-linked symlink paths as direct entrypoints", () => {
    const dir = mkdtempSync(join(tmpdir(), "rss-summary-cli-"));
    const target = join(dir, "cli.js");
    const link = join(dir, "rss-summary");
    writeFileSync(target, "");
    symlinkSync(target, link);

    expect(isCliEntrypoint(pathToFileURL(target).href, link)).toBe(true);
  });

  it("shows remove and delete aliases in help", async () => {
    const output: string[] = [];

    const exitCode = await runCliCommand(["help"], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
    });

    expect(exitCode).toBe(0);
    expect(output.join("")).toContain("rss-summary github-home login");
    expect(output.join("")).toContain("rss-summary feeds remove --url <rss-url>");
    expect(output.join("")).toContain("rss-summary feeds delete --url <rss-url>");
    expect(output.join("")).toContain("rss-summary digest [--rss-only]");
  });
});
