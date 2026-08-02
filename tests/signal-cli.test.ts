import { describe, expect, it, vi } from "vitest";

import { runSignalCommand, writeSignalHelp } from "../src/presentation/signal-cli.js";

describe("signal CLI command", () => {
  it("prints the generated markdown for an explicit day", async () => {
    const output: string[] = [];
    const generate = vi.fn(async (input: unknown) => ({
      day: "2026-07-29",
      generatedAt: "2026-07-29T11:00:00.000Z",
      itemCount: 1,
      markdown: "# 高信号速览 · 2026-07-29\n",
      sections: { updates: 1, opensource: 0 },
      warnings: [],
    }));

    const exitCode = await runSignalCommand(["--day", "2026-07-29"], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
      generate,
    });

    expect(exitCode).toBe(0);
    expect(generate).toHaveBeenCalledWith({ day: "2026-07-29" }, expect.anything());
    expect(output.join("")).toContain("# 高信号速览 · 2026-07-29");
  });

  it("falls back to the current instant when neither day nor occurrence is given", async () => {
    const generate = vi.fn(async (input: unknown) => ({
      day: "2026-07-29",
      generatedAt: "2026-07-29T11:00:00.000Z",
      itemCount: 0,
      markdown: "# 高信号速览 · 2026-07-29\n",
      sections: { updates: 0, opensource: 0 },
      warnings: [],
    }));

    await runSignalCommand([], { stdout: { write: () => undefined }, generate });

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ occurrence: expect.any(String) }), expect.anything());
  });

  it("prints help and exits cleanly for --help", async () => {
    const output: string[] = [];

    const exitCode = await runSignalCommand(["--help"], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
    });

    expect(exitCode).toBe(0);
    expect(output.join("")).toContain("rss-summary signal");
  });

  it("reports generation failures on stderr", async () => {
    const errors: string[] = [];
    const generate = vi.fn(async () => {
      throw new Error("All signal sources failed.");
    });

    const exitCode = await runSignalCommand(["--day", "2026-07-29"], {
      stdout: { write: () => undefined },
      stderr: { write: (chunk) => errors.push(String(chunk)) },
      generate,
    });

    expect(exitCode).toBe(1);
    expect(errors.join("")).toContain("All signal sources failed.");
  });
});

describe("writeSignalHelp", () => {
  it("documents day, occurrence, and dry-run options", () => {
    const output: string[] = [];
    writeSignalHelp({ write: (chunk) => output.push(String(chunk)) });
    expect(output.join("")).toContain("--day");
    expect(output.join("")).toContain("--occurrence");
    expect(output.join("")).toContain("--dry-run");
  });
});
