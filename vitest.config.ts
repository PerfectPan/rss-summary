import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        // CLI side-effect entry only; behavior covered via presentation/cli tests.
      ],
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
});
