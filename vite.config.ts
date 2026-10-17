import { defineConfig } from "vite-plus";

/**
 * Vite+ unified config: Vitest + Oxlint (+ optional Oxfmt via `vp check` / `vp fmt`).
 * Library build remains `tsc -p tsconfig.build.json` (CLI bin + rivus-plugin exports).
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85,
      },
    },
  },

  lint: {
    plugins: ["oxc", "typescript", "unicorn"],
    ignorePatterns: ["dist/**", "coverage/**", "node_modules/**", "scripts/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "typescript/no-explicit-any": "error",
      // fetch() RequestInfo | URL is commonly stringified in adapter tests.
      "typescript/no-base-to-string": "off",
      // Mutating URLSearchParams while iterating requires a key snapshot.
      "unicorn/no-useless-spread": "off",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["error", { allow: ["error", "warn"] }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["src/domain/**/*.ts"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "**/application/*",
                    "**/infrastructure/*",
                    "**/presentation/*",
                    "effect",
                    "node:*",
                  ],
                  message: "domain must stay pure: no outer layers, Effect, or Node built-ins.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["src/application/**/*.ts"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: ["**/presentation/*"],
                  message:
                    "application must not import presentation; inject render at the entrypoint.",
                },
              ],
            },
          ],
        },
      },
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },

  fmt: {
    // Keep close to previous TS style; Oxfmt defaults are Prettier-compatible.
    semi: true,
    singleQuote: false,
    // Docs / JSON config are edited for content, not for Oxfmt churn.
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "docs/**",
      "feeds.json",
      "industry-feeds.json",
      "news-topics.json",
      "pnpm-lock.yaml",
      "package.json",
      "scripts/**",
    ],
  },
});
