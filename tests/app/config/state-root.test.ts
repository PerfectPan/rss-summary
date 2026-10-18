import { describe, expect, it } from "vite-plus/test";

import {
  dailyAiDiagnosticsDir,
  defaultGithubHomeStorageState,
  defaultIndustryStateFile,
  defaultRunLogDir,
  defaultStateFile,
  deploymentStateRoot,
} from "../../../src/app/config/state-root.js";

describe("app/config/state-root", () => {
  it("keeps the literal relative .state defaults", () => {
    expect(defaultStateFile).toBe(".state/feed-state.json");
    expect(defaultIndustryStateFile).toBe(".state/industry-state.json");
    expect(defaultRunLogDir).toBe(".state/runs");
    expect(defaultGithubHomeStorageState).toBe(".state/github-home-storage.json");
    expect(deploymentStateRoot({})).toBeUndefined();
    expect(dailyAiDiagnosticsDir({})).toBe(".state/daily-ai");
  });

  it("redirects only Rivus deployment state under the override", () => {
    expect(deploymentStateRoot({ RIVUS_DEPLOYMENT_STATE_DIR: "/srv/rivus" })).toBe("/srv/rivus");
    expect(dailyAiDiagnosticsDir({ RIVUS_DEPLOYMENT_STATE_DIR: "/srv/rivus" })).toBe(
      "/srv/rivus/rss-summary/daily-ai",
    );
    expect(defaultStateFile).toBe(".state/feed-state.json");
  });
});
