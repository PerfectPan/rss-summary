import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("CI harness", () => {
  it("exposes one local verify command for CI and humans", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.verify).toBe("pnpm test && pnpm typecheck && pnpm build");
  });

  it("runs the verify command on pull requests and main pushes", () => {
    const workflowUrl = new URL("../.github/workflows/ci.yml", import.meta.url);
    expect(existsSync(workflowUrl)).toBe(true);

    const workflow = readFileSync(workflowUrl, "utf8");
    expect(workflow).toContain("name: CI");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("node-version: 24.x");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm verify");
  });

  it("documents the protected-branch collaboration workflow for agents", () => {
    const instructionsUrl = new URL("../AGENTS.md", import.meta.url);
    expect(existsSync(instructionsUrl)).toBe(true);

    const instructions = readFileSync(instructionsUrl, "utf8");
    expect(instructions).toContain("Do not push directly to `main`");
    expect(instructions).toContain("`codex/...` branch");
    expect(instructions).toContain("Run `pnpm verify`");
  });
});
