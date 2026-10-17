import { Cause, Clock, Effect, Exit } from "effect";

import { errorMessage } from "../../../kernel/index.js";
import type { RunAudit } from "../../domain/run-audit/index.js";
import { Notifier, RunArchive } from "../ports.js";

export type DeliveryOrder<R = never> = {
  readonly runLogDir: string;
  readonly audit: RunAudit;
  readonly output: string;
  readonly dryRun: boolean;
  /**
   * Runs only after a successful send (typically marking the ledger as
   * delivered and saving it). Its failure is recorded as `stateStatus:
   * "failed"` and rethrown; the send itself is not repeated.
   */
  readonly afterSend?: Effect.Effect<void, Error, R>;
};

const completedAtNow = Effect.map(Clock.currentTimeMillis, (millis) =>
  new Date(millis).toISOString(),
);

/**
 * Deliver output, then record the run. Order is fixed: send first, mark state
 * only after the send succeeded, then write the run artifact. Failures are
 * recorded before being rethrown so the run log always explains the outcome.
 */
export function deliver<R>(
  order: DeliveryOrder<R>,
): Effect.Effect<void, Error, Notifier | RunArchive | R> {
  return Effect.gen(function* () {
    const notifier = yield* Notifier;
    const archive = yield* RunArchive;

    const sendExit = yield* Effect.exit(notifier.send(order.output));
    if (Exit.isFailure(sendExit)) {
      yield* archive.save(
        order.runLogDir,
        order.audit,
        {
          status: "failed",
          completedAt: yield* completedAtNow,
          channel: notifier.channel,
          stateStatus: "skipped",
          error: errorMessage(Cause.squash(sendExit.cause)),
        },
        order.output,
      );
      return yield* Effect.failCause(sendExit.cause);
    }

    if (order.afterSend) {
      // Marking the ledger and saving it must not be interrupted halfway.
      const stateExit = yield* Effect.exit(Effect.uninterruptible(order.afterSend));
      if (Exit.isFailure(stateExit)) {
        yield* archive.save(
          order.runLogDir,
          order.audit,
          {
            status: order.dryRun ? "dry-run" : "delivered",
            completedAt: yield* completedAtNow,
            channel: notifier.channel,
            stateStatus: "failed",
            error: errorMessage(Cause.squash(stateExit.cause)),
          },
          order.output,
        );
        return yield* Effect.failCause(stateExit.cause);
      }
    }

    yield* archive.save(
      order.runLogDir,
      order.audit,
      {
        status: order.dryRun ? "dry-run" : "delivered",
        completedAt: yield* completedAtNow,
        channel: notifier.channel,
        stateStatus: order.afterSend ? "updated" : "skipped",
      },
      order.output,
    );
  });
}
