import { knip } from "@perfectpan/lint-config/knip";
import type { KnipConfig } from "knip";

// The CLI entry runs through tsx (`pnpm digest` / `pnpm feeds`); vitest discovers
// the inline *.test.ts files next to their sources, and scripts/ plus the test
// support tree are reachable from package.json scripts and the vitest setup.
const config: KnipConfig = {
  ...knip,
  workspaces: {
    ".": {
      // The bin source and vite.config.ts are auto-detected entries.
      project: ["src/**/*.ts!", "scripts/**/*.mjs", "tests/support/**/*.ts"]
    }
  }
};

export default config;
