import { join } from "node:path";

/**
 * State-directory policy. Defaults are the literal relative `.state/…` paths,
 * independent of the working directory. `RIVUS_DEPLOYMENT_STATE_DIR` redirects
 * only the Rivus-owned diagnostics store (delivery keeps the same formula:
 * `<root>/rss-summary/daily-ai` when the override is set).
 */
export const defaultStateDir = ".state";

export const defaultStateFile = `${defaultStateDir}/feed-state.json`;
export const defaultIndustryStateFile = `${defaultStateDir}/industry-state.json`;
export const defaultRunLogDir = `${defaultStateDir}/runs`;
export const defaultGithubHomeStorageState = `${defaultStateDir}/github-home-storage.json`;

/** Root for Rivus-deployment-owned state; undefined when the override is unset. */
export function deploymentStateRoot(env: NodeJS.ProcessEnv): string | undefined {
  return env.RIVUS_DEPLOYMENT_STATE_DIR || undefined;
}

/** Diagnostics directory for the Daily AI tool, matching delivery's layout. */
export function dailyAiDiagnosticsDir(env: NodeJS.ProcessEnv): string {
  const root = deploymentStateRoot(env);
  return root ? join(root, "rss-summary", "daily-ai") : join(defaultStateDir, "daily-ai");
}
