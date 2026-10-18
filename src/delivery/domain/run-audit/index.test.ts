import { describe, expect, it } from "vite-plus/test";

import { isFailedRun, type RunSourceResult, type StoredRunAudit } from "../../index.js";

describe("failed run detection", () => {
  it("marks a run failed when delivery failed, state failed, or a source failed", () => {
    expect(isFailedRun(stored({ delivery: { status: "failed", stateStatus: "skipped" } }))).toBe(
      true,
    );
    expect(isFailedRun(stored({ delivery: { status: "delivered", stateStatus: "failed" } }))).toBe(
      true,
    );
    expect(isFailedRun(stored({ sources: [source("failed")] }))).toBe(true);
  });

  it("keeps a fully successful run out of the failures list", () => {
    expect(isFailedRun(stored({}))).toBe(false);
    expect(isFailedRun(stored({ sources: [source("ok"), source("skipped")] }))).toBe(false);
  });
});

function stored(
  overrides: {
    delivery?: Partial<StoredRunAudit["delivery"]>;
    sources?: RunSourceResult[];
  } = {},
): StoredRunAudit {
  return {
    version: 1,
    runId: "run-1",
    product: "subscriptions",
    generatedAt: "2026-08-09T01:00:00.000Z",
    sources: overrides.sources ?? [],
    counts: { fetched: 0, inWindow: 0, ranked: 0, selected: 0, researchPending: 0 },
    candidates: [],
    delivery: {
      status: "delivered",
      completedAt: "2026-08-09T01:01:00.000Z",
      channel: "stdout",
      stateStatus: "updated",
      ...overrides.delivery,
    },
  };
}

function source(status: RunSourceResult["status"]): RunSourceResult {
  return { id: "feed", kind: "rss", name: "Feed", status, itemCount: 0 };
}
