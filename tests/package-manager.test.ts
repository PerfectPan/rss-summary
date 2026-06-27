import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("package manager", () => {
  it("uses pnpm as the repository package manager", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      packageManager?: string;
    };

    expect(pkg.packageManager).toBe("pnpm@11.7.0");
    expect(existsSync(new URL("../package-lock.json", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../pnpm-lock.yaml", import.meta.url))).toBe(true);
    expect(readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8")).toContain("esbuild: true");
  });
});
