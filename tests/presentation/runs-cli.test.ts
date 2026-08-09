import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { RunAudit } from "../../src/domain/run-audit.js";
import { runArtifactLabel, saveRunArtifact } from "../../src/infrastructure/run-store.js";
import { runRunsCommand } from "../../src/presentation/runs-cli.js";

describe("runs CLI", () => {
  it("lists and filters stored runs", () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-runs-cli-"));
    const output: string[] = [];
    try {
      saveRunArtifact(
        root,
        audit(),
        {
          status: "failed",
          completedAt: "2026-08-09T12:35:00.000Z",
          channel: "webhook",
          stateStatus: "skipped",
          error: "boom",
        },
        "# 行业前沿",
      );

      expect(
        runRunsCommand(["failures", "--dir", root], {
          stdout: { write: (chunk) => output.push(chunk) },
        }),
      ).toBe(0);
      expect(output.join("")).toContain("frontier  failed");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("shows an artifact by label and handles an empty store", () => {
    const root = mkdtempSync(join(tmpdir(), "rss-summary-runs-show-"));
    const output: string[] = [];
    try {
      expect(
        runRunsCommand(["list", "--dir", root], {
          stdout: { write: (chunk) => output.push(chunk) },
        }),
      ).toBe(0);
      expect(output.pop()).toBe("No run artifacts.\n");

      const saved = saveRunArtifact(
        root,
        audit(),
        {
          status: "delivered",
          completedAt: "2026-08-09T12:35:00.000Z",
          channel: "stdout",
          stateStatus: "updated",
        },
        "# 行业前沿",
      );
      expect(
        runRunsCommand(["show", runArtifactLabel(saved.jsonPath), "--dir", root], {
          stdout: { write: (chunk) => output.push(chunk) },
        }),
      ).toBe(0);
      expect(output.join("")).toContain('"product": "frontier"');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

function audit(): RunAudit {
  return {
    version: 1,
    runId: "12345678-abcd-4000-8000-123456789abc",
    product: "frontier",
    generatedAt: "2026-08-09T12:34:56.000Z",
    sources: [],
    counts: { fetched: 1, inWindow: 1, ranked: 1, selected: 1, researchPending: 0 },
    candidates: [],
  };
}
