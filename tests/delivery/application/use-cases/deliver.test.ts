import { describe, expect, it } from "vite-plus/test";
import { Effect, Layer } from "effect";

import {
  deliver,
  Notifier,
  RunArchive,
  type RunAudit,
  type RunDelivery,
} from "../../../../src/delivery/index.js";

describe("audited delivery", () => {
  it("records a dry run after successful output", async () => {
    const sends: string[] = [];
    const deliveries: RunDelivery[] = [];

    await runDeliver(
      { channel: "stdout", send: (markdown) => Effect.sync(() => sends.push(markdown)) },
      deliveries,
      { dryRun: true },
      "# Brief",
    );

    expect(sends).toEqual(["# Brief"]);
    expect(deliveries[0]).toMatchObject({
      status: "dry-run",
      channel: "stdout",
      stateStatus: "skipped",
    });
  });

  it("records the delivery error before rethrowing", async () => {
    const deliveries: RunDelivery[] = [];

    await expect(
      runDeliver(
        {
          channel: "webhook",
          send: () => Effect.fail(new Error("delivery failed")),
        },
        deliveries,
        {},
        "x",
      ),
    ).rejects.toThrow("delivery failed");
    expect(deliveries[0]).toMatchObject({
      status: "failed",
      channel: "webhook",
      stateStatus: "skipped",
      error: "delivery failed",
    });
  });

  it("distinguishes a post-delivery state failure", async () => {
    const deliveries: RunDelivery[] = [];

    await expect(
      runDeliver(
        { channel: "stdout", send: () => Effect.void },
        deliveries,
        { afterSend: Effect.fail(new Error("state write failed")) },
        "x",
      ),
    ).rejects.toThrow("state write failed");
    expect(deliveries[0]).toMatchObject({
      status: "delivered",
      stateStatus: "failed",
      error: "state write failed",
    });
  });

  it("marks state as updated after a successful send and afterSend", async () => {
    const deliveries: RunDelivery[] = [];
    const afterSend: string[] = [];

    await runDeliver(
      { channel: "stdout", send: () => Effect.void },
      deliveries,
      {
        afterSend: Effect.sync(() => afterSend.push("marked")),
      },
      "x",
    );

    expect(afterSend).toEqual(["marked"]);
    expect(deliveries[0]).toMatchObject({ status: "delivered", stateStatus: "updated" });
  });
});

function runDeliver(
  notifier: {
    channel: "stdout" | "webhook";
    send: (markdown: string) => Effect.Effect<void, Error>;
  },
  deliveries: RunDelivery[],
  extra: { dryRun?: boolean; afterSend?: Effect.Effect<void, Error> },
  output: string,
): Promise<void> {
  return Effect.runPromise(
    Effect.provide(
      deliver({
        runLogDir: ".state/runs",
        audit: audit(),
        output,
        dryRun: extra.dryRun ?? false,
        ...(extra.afterSend ? { afterSend: extra.afterSend } : {}),
      }),
      Layer.mergeAll(
        Layer.succeed(Notifier, notifier),
        Layer.succeed(RunArchive, {
          save: (_root: string, _audit: RunAudit, delivery: RunDelivery) => {
            deliveries.push(delivery);
            return Effect.succeed({ jsonPath: "run.json", markdownPath: "run.md" });
          },
          list: () => Effect.succeed([]),
          load: () => Effect.die(new Error("unused in this test")),
          label: (path: string) => path,
        }),
      ),
    ),
  );
}

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
