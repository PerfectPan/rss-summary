import { describe, expect, it, vi } from "vite-plus/test";

import {
  runGithubHomeCommand,
  writeGithubHomeHelp,
} from "../../src/presentation/github-home-cli.js";

vi.mock("../../src/infrastructure/github-home.js", () => ({
  saveGithubHomeStorageState: vi.fn(),
}));

import { saveGithubHomeStorageState } from "../../src/infrastructure/github-home.js";

describe("github-home CLI command", () => {
  it("prints help for the help subcommand", async () => {
    const output: string[] = [];

    const exitCode = await runGithubHomeCommand(["help"], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
    });

    expect(exitCode).toBe(0);
    expect(output.join("")).toContain("rss-summary github-home login");
  });

  it("returns an error exit code for unknown subcommands", async () => {
    const output: string[] = [];

    const exitCode = await runGithubHomeCommand(["frobnicate"], {
      stdout: { write: (chunk) => output.push(String(chunk)) },
    });

    expect(exitCode).toBe(1);
  });

  it("reports login failures on stderr without a trace", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    vi.mocked(saveGithubHomeStorageState).mockRejectedValueOnce(new Error("browser unavailable"));

    const exitCode = await runGithubHomeCommand(
      ["login", "--storage-state", ".state/storage.json"],
      {
        stdout: { write: (chunk) => output.push(String(chunk)) },
        stderr: { write: (chunk) => errors.push(String(chunk)) },
      },
    );

    expect(exitCode).toBe(1);
    expect(errors.join("")).toContain("browser unavailable");
    expect(output.join("")).toBe("");
  });
});

describe("writeGithubHomeHelp", () => {
  it("documents the storage-state and browser-channel options", () => {
    const output: string[] = [];
    writeGithubHomeHelp({ write: (chunk) => output.push(String(chunk)) });
    expect(output.join("")).toContain("--storage-state");
    expect(output.join("")).toContain("--browser-channel");
  });
});
