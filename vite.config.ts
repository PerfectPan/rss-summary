import { fmt, lint } from "@perfectpan/lint-config/vite-plus";
import { defineConfig } from "vite-plus";

/**
 * Vite+ unified config: Vitest + Oxlint (+ optional Oxfmt via `vp check` / `vp fmt`).
 * Library build remains `tsc -p tsconfig.build.json` (CLI bin + rivus-plugin exports).
 * Lint and format rules come from @perfectpan/lint-config; only repository-specific
 * settings live here.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Tests live next to their sources; coverage measures production files only.
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85
      }
    }
  },

  lint: {
    ...lint,
    ignorePatterns: ["dist/**", "coverage/**", "node_modules/**", "scripts/**"],
    // This repository has no JSX, and this vite-plus's oxlint does not ship the react
    // plugin, so the preset's react override cannot load here.
    overrides: lint.overrides.filter((override) => !override.plugins?.includes("react")),
    rules: {
      ...lint.rules,
      // fetch() RequestInfo | URL is commonly stringified in adapter tests.
      "typescript/no-base-to-string": "off",
      // Mutating URLSearchParams while iterating requires a key snapshot.
      "unicorn/no-useless-spread": "off",
      // The CLI reports diagnostics on stderr only; info goes through the renderers.
      "no-console": ["error", { allow: ["error", "warn"] }],
      // The typed-exit assertion helpers and the golden snapshot matchers
      // centralize expectations; count them as assertions.
      "vitest/expect-expect": [
        "error",
        {
          assertFunctionNames: ["expect", "expectFileMessage", "expectTypedNodeCause", "matchSnapshot", "matchDoubao"]
        }
      ],
      "vite-plus/prefer-vite-plus-imports": "error"
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin"
      }
    ]
  },

  fmt: {
    ...fmt,
    // Docs / JSON config are edited for content, not for Oxfmt churn.
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "docs/**",
      "tests/fixtures/**",
      "feeds.json",
      "industry-feeds.json",
      "news-topics.json",
      "pnpm-lock.yaml",
      "package.json",
      "scripts/**"
    ]
  }
});
