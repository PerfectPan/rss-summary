import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vite-plus/test";

import { isCliEntrypoint, runCliCommand } from "../../src/presentation/cli.js";

describe("top-level CLI", () => {
  it("routes feeds subcommands through the bin entrypoint", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "rss-summary-cli-")), "feeds.json");
    const output: string[] = [];

    const exitCode = await runCliCommand(
      [
        "feeds",
        "add",
        "--file",
        file,
        "--url",
        "https://github.blog/feed",
        "--name",
        "GitHub Blog",
      ],
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
    expect(output.join("")).toContain("rss-summary signal [--day YYYY-MM-DD]");
  });

  it("routes the signal command and prints the generated markdown", async () => {
    const output: string[] = [];
    const generate = vi.fn(async (_input: unknown) => ({
      day: "2026-07-29",
      generatedAt: "2026-07-29T11:00:00.000Z",
      itemCount: 1,
      markdown: "# 高信号速览 · 2026-07-29\n",
      sections: { updates: 1, opensource: 0 },
      warnings: [],
      updates: [],
      opensource: [],
      timezoneOffset: "+08:00",
    }));

    const exitCode = await runCliCommand(["signal", "--day", "2026-07-29", "--dry-run"], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
      signal: { generate },
    });

    expect(exitCode).toBe(0);
    expect(generate).toHaveBeenCalledWith({ day: "2026-07-29" }, expect.anything());
    expect(output.join("")).toContain("# 高信号速览 · 2026-07-29");
  });

  it("returns an error exit code for unknown commands", async () => {
    const exitCode = await runCliCommand(["frobnicate"], {
      stdout: { write: () => undefined },
    });

    expect(exitCode).toBe(1);
  });
});
