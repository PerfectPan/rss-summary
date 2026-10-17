import { Effect } from "effect";

import { isFailedRun, type StoredRunAudit } from "../../domain/run-audit/index.js";
import { RunArchive } from "../ports.js";

export type RunSummary = {
  readonly path: string;
  readonly run: StoredRunAudit;
};

/** Load every stored run artifact, newest first (archive ordering). */
export function listRuns(root: string): Effect.Effect<readonly RunSummary[], Error, RunArchive> {
  return Effect.gen(function* () {
    const archive = yield* RunArchive;
    const paths = yield* archive.list(root);
    return yield* Effect.forEach(paths, (path) =>
      Effect.map(archive.load(path), (run) => ({ path, run })),
    );
  });
}

export function listFailedRuns(
  root: string,
): Effect.Effect<readonly RunSummary[], Error, RunArchive> {
  return Effect.map(listRuns(root), (runs) => runs.filter(({ run }) => isFailedRun(run)));
}

/** Resolve a run label (file name without extension) to its artifact path. */
export function runArtifactForLabel(
  root: string,
  label: string,
): Effect.Effect<string | undefined, Error, RunArchive> {
  return RunArchive.use((archive) =>
    Effect.map(archive.list(root), (paths) =>
      paths.find((candidate) => archive.label(candidate) === label),
    ),
  );
}

export function readRunArtifact(path: string): Effect.Effect<StoredRunAudit, Error, RunArchive> {
  return RunArchive.use((archive) => archive.load(path));
}
