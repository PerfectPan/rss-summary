import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("package CLI metadata", () => {
  it("exposes a built rss-summary bin entry", () => {
    const buildConfig = JSON.parse(
      readFileSync(new URL("../../tsconfig.build.json", import.meta.url), "utf8"),
    ) as {
      compilerOptions?: { declaration?: boolean };
    };
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      bin?: Record<string, string>;
      devDependencies?: Record<string, string>;
      engines?: Record<string, string>;
      exports?: Record<string, unknown>;
      files?: string[];
      peerDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(pkg.bin?.["rss-summary"]).toBe("./dist/presentation/cli.js");
    expect(pkg.exports?.["./rivus-plugin"]).toEqual({
      import: "./dist/presentation/rivus-plugin.js",
      types: "./dist/presentation/rivus-plugin.d.ts",
      default: "./dist/presentation/rivus-plugin.js",
    });
    expect(pkg.peerDependencies?.["@rivus/agent"]).toBe("^0.12.7");
    expect(pkg.devDependencies?.["@rivus/agent"]).toBe("0.12.7");
    expect(pkg.engines?.node).toBe("^24.11.0");
    expect(pkg.files).toEqual([
      "dist",
      "docs/rivus-plugin.md",
      "industry-feeds.json",
      "news-topics.json",
      "README.md",
    ]);
    expect(pkg.scripts?.build).toBe("tsc -p tsconfig.build.json");
    expect(pkg.scripts?.["package:check"]).toBe("node scripts/check-package.mjs");
    expect(pkg.scripts?.verify).toBe(
      "pnpm test:layout && pnpm check && pnpm test && pnpm build && pnpm package:check",
    );
    expect(buildConfig.compilerOptions?.declaration).toBe(true);
  });
});
