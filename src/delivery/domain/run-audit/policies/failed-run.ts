import type { StoredRunAudit } from "../value-objects/run-audit.js";

/** A run counts as failed when delivery failed, state failed, or any source failed. */
export function isFailedRun(run: StoredRunAudit): boolean {
  return (
    run.delivery.status === "failed" ||
    run.delivery.stateStatus === "failed" ||
    run.sources.some((source) => source.status === "failed")
  );
}
