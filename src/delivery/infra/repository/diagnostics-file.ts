import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Layer } from "effect";

import { DiagnosticsStore, type DailyAiDiagnosticSnapshot } from "../../application/ports.js";

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Preserve recovery evidence locally without adding it to the model's tool messages. */
export async function saveDailyAiDiagnostics(
  snapshot: DailyAiDiagnosticSnapshot,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const directory = env.RIVUS_DEPLOYMENT_STATE_DIR
    ? join(env.RIVUS_DEPLOYMENT_STATE_DIR, "rss-summary", "daily-ai")
    : join(".state", "daily-ai");
  const occurrenceKey = createHash("sha256").update(snapshot.occurrence).digest("hex");
  const target = join(directory, `${occurrenceKey}-${snapshot.phase}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, JSON.stringify(snapshot) + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export const DiagnosticsFileLive = (
  env: NodeJS.ProcessEnv = process.env,
): Layer.Layer<DiagnosticsStore> =>
  Layer.succeed(DiagnosticsStore, {
    save: (snapshot) =>
      Effect.tryPromise({
        try: () => saveDailyAiDiagnostics(snapshot, env),
        catch: toError,
      }),
  });
