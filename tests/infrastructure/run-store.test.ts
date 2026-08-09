import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RunAudit } from "../../src/domain/run-audit.js";
import {
  listRunArtifacts,
  loadRunArtifact,
  saveRunArtifact,
} from "../../src/infrastructure/run-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("run artifact store", () => {
  it("persists paired JSON and Markdown audit artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-runs-"));
    roots.push(root);
    const audit: RunAudit = {
      version: 1,
      runId: "12345678-abcd-4000-8000-123456789abc",
      product: "subscriptions",
      generatedAt: "2026-08-09T12:34:56.000Z",
      sources: [],
      counts: { fetched: 2, inWindow: 2, ranked: 2, selected: 1, researchPending: 0 },
      candidates: [],
    };

    const saved = saveRunArtifact(
      root,
      audit,
      {
        status: "delivered",
        completedAt: "2026-08-09T12:35:00.000Z",
        channel: "webhook",
        stateStatus: "updated",
      },
      "# 我的订阅",
    );

    expect(listRunArtifacts(root)).toEqual([saved.jsonPath]);
    expect(loadRunArtifact(saved.jsonPath).delivery.status).toBe("delivered");
    expect(saved.markdownPath).toContain("subscriptions-123456-12345678.md");
  });
});
