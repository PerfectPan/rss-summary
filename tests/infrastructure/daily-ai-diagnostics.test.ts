import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  saveDailyAiDiagnostics,
  type DailyAiDiagnosticSnapshot,
} from "../../src/infrastructure/daily-ai-diagnostics.js";

describe("Daily AI diagnostics", () => {
  it("retains complete private snapshots per occurrence and phase without changing delivery state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "daily-ai-diagnostics-"));
    const env = { RIVUS_DEPLOYMENT_STATE_DIR: directory };
    const occurrence = "2026-08-11T01:00:00Z";
    const snapshot: DailyAiDiagnosticSnapshot = {
      occurrence,
      phase: "collect",
      result: {
        day: "2026-08-11",
        windowLabel: "test window",
        generatedAt: occurrence,
        evidence: [],
        items: [],
        warnings: [],
        sourceAudit: { xAccounts: [] },
        audit: { decisions: [], editorialIssues: [] },
        deliveryReceipt: { id: "daily-ai:test", occurrence, evidenceIds: [], committed: false },
      },
    };
    try {
      await saveDailyAiDiagnostics(snapshot, env);
      snapshot.result.warnings = ["Source unavailable"];
      await saveDailyAiDiagnostics(snapshot, env);
      await saveDailyAiDiagnostics({ ...snapshot, phase: "render" }, env);
      await saveDailyAiDiagnostics({ ...snapshot, occurrence: "2026-08-12T01:00:00Z" }, env);
      const output = join(directory, "rss-summary", "daily-ai");
      const files = await readdir(output);
      expect(files).toHaveLength(3);
      for (const file of files) {
        expect(file).toMatch(/^[a-f0-9]{64}-(collect|render)\.json$/u);
        const path = join(output, file);
        const saved = JSON.parse(await readFile(path, "utf8"));
        expect(saved.result).toEqual(snapshot.result);
        expect((await stat(path)).mode & 0o777).toBe(0o600);
      }
      expect(snapshot.result.deliveryReceipt.committed).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
