import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("CI harness", () => {
  it("exposes one local verify command for CI and humans", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.verify).toBe(
      "pnpm test:layout && pnpm lint && pnpm test && pnpm typecheck && pnpm build && pnpm package:check",
    );
    expect(pkg.scripts?.lint).toBe("eslint src tests");
    expect(pkg.scripts?.["test:layout"]).toBe("node scripts/check-test-layout.mjs");
    expect(pkg.scripts?.["test:coverage"]).toBe("vitest run --coverage");
  });

  it("runs the verify command on pull requests and main pushes", () => {
    const workflowUrl = new URL("../../.github/workflows/ci.yml", import.meta.url);
    expect(existsSync(workflowUrl)).toBe(true);

    const workflow = readFileSync(workflowUrl, "utf8");
    expect(workflow).toContain("name: CI");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("node-version: 24.x");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm verify");
    expect(workflow).toContain("pnpm test:layout && pnpm test:coverage");
  });

  it("mirrors src layers under tests/ and keeps coverage thresholds", () => {
    const vitest = readFileSync(new URL("../../vitest.config.ts", import.meta.url), "utf8");
    expect(vitest).toContain('include: ["tests/**/*.test.ts"]');
    expect(vitest).toContain("statements: 85");
    expect(vitest).toContain("branches: 75");
    expect(vitest).toContain("functions: 90");
    expect(vitest).toContain("lines: 85");
    expect(existsSync(new URL("../../scripts/check-test-layout.mjs", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../eslint.config.js", import.meta.url))).toBe(true);
  });

  it("documents the protected-branch collaboration workflow for agents", () => {
    const instructionsUrl = new URL("../../AGENTS.md", import.meta.url);
    expect(existsSync(instructionsUrl)).toBe(true);

    const instructions = readFileSync(instructionsUrl, "utf8");
    expect(instructions).toContain("Do not push directly to `main`");
    expect(instructions).toContain("`codex/...` branch");
    expect(instructions).toContain("Run `pnpm verify`");
  });

  it("provides Claude-specific instructions with the same harness", () => {
    const instructionsUrl = new URL("../../CLAUDE.md", import.meta.url);
    expect(existsSync(instructionsUrl)).toBe(true);

    const instructions = readFileSync(instructionsUrl, "utf8");
    expect(instructions).toContain("Follow `AGENTS.md` first");
    expect(instructions).toContain("Do not push directly to `main`");
    expect(instructions).toContain("Open a pull request");
    expect(instructions).toContain("Run `pnpm verify`");
    expect(instructions).toContain("local TypeScript CLI");
  });
});
