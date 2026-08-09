import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  parseResearchSuggestions,
  runResearchCommand,
} from "../../src/presentation/research-cli.js";

describe("research CLI", () => {
  it("parses the suggestion block emitted by the feed-research prompt", () => {
    const suggestions = parseResearchSuggestions(`日报正文……

调研状态更新建议:
- github:owner/useful-tool - decision=track reason="agent tooling worth watching"
- rss:https://example.com/post - decision=read reason="covers MCP internals"
- not-a-suggestion-line
`);

    expect(suggestions).toEqual([
      {
        key: "github:owner/useful-tool",
        decision: "track",
        reason: "agent tooling worth watching",
      },
      {
        key: "rss:https://example.com/post",
        decision: "read",
        reason: "covers MCP internals",
      },
    ]);
  });

  it("accepts suggestions without a reason", () => {
    expect(parseResearchSuggestions("- github:owner/repo - decision=ignore")).toEqual([
      { key: "github:owner/repo", decision: "ignore", reason: undefined },
    ]);
  });

  it("writes research decisions from stdin into the state file", async () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-research-"));
    const stateFile = join(root, "feed-state.json");
    const output: string[] = [];

    async function* stdin() {
      yield '调研状态更新建议:\n- github:owner/repo - decision=track reason="good"\n';
    }

    const exitCode = await runResearchCommand(["add", "--state-file", stateFile], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
      stdin: stdin(),
    });

    expect(exitCode).toBe(0);
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(state.researched["github:owner/repo"]).toMatchObject({
      decision: "track",
      reason: "good",
    });
    expect(output.join("")).toContain("Marked 1 research decision");
  });

  it("reads suggestions from --file when provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-research-"));
    const stateFile = join(root, "feed-state.json");
    const suggestionFile = join(root, "suggestions.txt");
    writeFileSync(suggestionFile, "- rss:https://example.com/a - decision=read\n");
    const output: string[] = [];

    const exitCode = await runResearchCommand(
      ["add", "--file", suggestionFile, "--state-file", stateFile],
      { stdout: { write: (chunk) => output.push(String(chunk)) } },
    );

    expect(exitCode).toBe(0);
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(state.researched["rss:https://example.com/a"]).toMatchObject({ decision: "read" });
  });

  it("returns non-zero when no suggestions are found", async () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-research-"));
    const stateFile = join(root, "feed-state.json");
    const stderr: string[] = [];

    async function* stdin() {
      yield "nothing useful here";
    }

    const exitCode = await runResearchCommand(["add", "--state-file", stateFile], {
      stderr: { write: (chunk) => stderr.push(String(chunk)) },
      stdin: stdin(),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("No research suggestions");
  });
});
