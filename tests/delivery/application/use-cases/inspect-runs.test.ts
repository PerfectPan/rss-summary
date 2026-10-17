import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  listFailedRuns,
  listRuns,
  readRunArtifact,
  RunArchive,
  RunArchiveFilesLive,
  runArtifactForLabel,
  runArtifactLabel,
  saveRunArtifact,
  type RunAudit,
  type RunDelivery,
  type RunSourceResult,
} from "../../../../src/delivery/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("inspect runs", () => {
  it("lists runs newest first and keeps only failed ones for failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-inspect-runs-"));
    roots.push(root);
    const failed = saveRunArtifact(
      root,
      audit("1", "2026-08-09T12:34:56.000Z"),
      failedDelivery(),
      "# a",
    );
    const ok = saveRunArtifact(root, audit("2", "2026-08-09T13:34:56.000Z"), okDelivery(), "# b");
    const sourceFailure = saveRunArtifact(
      root,
      { ...audit("3", "2026-08-09T14:34:56.000Z"), sources: [sourceResult("failed")] },
      okDelivery(),
      "# c",
    );

    const runs = await run(listRuns(root));
    expect(runs.map(({ path }) => path)).toEqual([
      sourceFailure.jsonPath,
      ok.jsonPath,
      failed.jsonPath,
    ]);

    const failedRuns = await run(listFailedRuns(root));
    expect(failedRuns.map(({ path }) => path)).toEqual([sourceFailure.jsonPath, failed.jsonPath]);

    expect(await run(runArtifactForLabel(root, runArtifactLabel(ok.jsonPath)))).toBe(ok.jsonPath);
    expect(await run(runArtifactForLabel(root, "missing-label"))).toBeUndefined();

    expect((await run(readRunArtifact(failed.jsonPath))).delivery.status).toBe("failed");
  });
});

function run<A, E>(effect: Effect.Effect<A, E, RunArchive>): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, RunArchiveFilesLive));
}

function audit(suffix: string, generatedAt: string): RunAudit {
  return {
    version: 1,
    runId: `run-${suffix}`,
    product: "subscriptions",
    generatedAt,
    sources: [],
    counts: { fetched: 0, inWindow: 0, ranked: 0, selected: 0, researchPending: 0 },
    candidates: [],
  };
}

function sourceResult(status: RunSourceResult["status"]): RunSourceResult {
  return { id: "feed", kind: "rss", name: "Feed", status, itemCount: 0 };
}

function failedDelivery(): RunDelivery {
  return {
    status: "failed",
    completedAt: "2026-08-09T12:35:00.000Z",
    channel: "stdout",
    stateStatus: "skipped",
    error: "boom",
  };
}

function okDelivery(): RunDelivery {
  return {
    status: "delivered",
    completedAt: "2026-08-09T12:35:00.000Z",
    channel: "stdout",
    stateStatus: "updated",
  };
}
