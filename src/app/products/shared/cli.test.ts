import { describe, expect, it } from "vite-plus/test";

import { parseCommandOptions, runCliCommand } from "./cli.js";

const writable = (lines: string[]): { write(chunk: string): unknown } => ({
  write(chunk: string) {
    lines.push(chunk);
    return lines.length;
  }
});

describe("product CLI plumbing", () => {
  it("parses `command --option value` pairs", () => {
    expect(parseCommandOptions(["feeds", "--file", "feeds.json", "--tags", "ai,mcp"])).toEqual({
      command: "feeds",
      options: { file: "feeds.json", tags: "ai,mcp" }
    });
    expect(parseCommandOptions(["research", "--state-file", ".state/x.json"])).toEqual({
      command: "research",
      options: { stateFile: ".state/x.json" }
    });
    expect(parseCommandOptions([])).toEqual({ command: "help", options: {} });
    expect(() => parseCommandOptions(["feeds", "--file"])).toThrow(/--file requires a value/);
    expect(() => parseCommandOptions(["feeds", "--file", "--tags"])).toThrow(/--file requires a value/);
  });

  it("runs the body and reports a failure on stderr with exit 1", async () => {
    const out: string[] = [];
    const err: string[] = [];
    await expect(
      runCliCommand({ stdout: writable(out), stderr: writable(err) }, async (stdout) => {
        stdout.write("done\n");
        return 0;
      })
    ).resolves.toBe(0);
    expect(out).toEqual(["done\n"]);

    await expect(
      runCliCommand({ stdout: writable(out), stderr: writable(err) }, async () => {
        throw new Error("boom");
      })
    ).resolves.toBe(1);
    expect(err).toEqual(["boom\n"]);
  });
});
