import { describe, expect, it, vi } from "vite-plus/test";

import { deliverAndRecord } from "../../src/application/delivery.js";
import type { RunAudit } from "../../src/domain/run-audit.js";
import { loadConfig } from "../../src/infrastructure/config.js";
import type { saveRunArtifact as SaveRunArtifact } from "../../src/infrastructure/run-store.js";

describe("audited delivery", () => {
  it("records a dry run after successful output", async () => {
    const send = vi.fn(async () => undefined);
    const deliveries: Parameters<typeof SaveRunArtifact>[2][] = [];
    const save: typeof SaveRunArtifact = (_root, _audit, delivery) => {
      deliveries.push(delivery);
      return { jsonPath: "run.json", markdownPath: "run.md" };
    };

    await deliverAndRecord(loadConfig({}, ["--dry-run"]), audit(), "# Brief", {
      send,
      save,
      now: () => "2026-08-09T01:01:00.000Z",
    });

    expect(send).toHaveBeenCalledWith("# Brief");
    expect(deliveries[0]).toMatchObject({ status: "dry-run", channel: "stdout" });
  });

  it("records the delivery error before rethrowing", async () => {
    const deliveries: Parameters<typeof SaveRunArtifact>[2][] = [];
    const save: typeof SaveRunArtifact = (_root, _audit, delivery) => {
      deliveries.push(delivery);
      return { jsonPath: "run.json", markdownPath: "run.md" };
    };

    await expect(
      deliverAndRecord(
        loadConfig({ NOTIFY_WEBHOOK_URL: "https://example.com/hook" }),
        audit(),
        "x",
        {
          send: async () => {
            throw new Error("delivery failed");
          },
          save,
          now: () => "2026-08-09T01:01:00.000Z",
        },
      ),
    ).rejects.toThrow("delivery failed");
    expect(deliveries[0]).toMatchObject({
      status: "failed",
      channel: "webhook",
      error: "delivery failed",
    });
  });

  it("distinguishes a post-delivery state failure", async () => {
    const deliveries: Parameters<typeof SaveRunArtifact>[2][] = [];
    const save: typeof SaveRunArtifact = (_root, _audit, delivery) => {
      deliveries.push(delivery);
      return { jsonPath: "run.json", markdownPath: "run.md" };
    };

    await expect(
      deliverAndRecord(loadConfig({}), audit(), "x", {
        send: async () => undefined,
        afterSend: () => {
          throw new Error("state write failed");
        },
        save,
      }),
    ).rejects.toThrow("state write failed");
    expect(deliveries[0]).toMatchObject({
      status: "delivered",
      stateStatus: "failed",
      error: "state write failed",
    });
  });
});

function audit(): RunAudit {
  return {
    version: 1,
    runId: "run-1",
    product: "subscriptions",
    generatedAt: "2026-08-09T01:00:00.000Z",
    sources: [],
    counts: { fetched: 0, inWindow: 0, ranked: 0, selected: 0, researchPending: 0 },
    candidates: [],
  };
}
