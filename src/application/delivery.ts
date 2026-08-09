import type { RunAudit } from "../domain/run-audit.js";
import type { AppConfig } from "../infrastructure/config.js";
import { createNotifier } from "../infrastructure/notifier.js";
import { errorMessage } from "../infrastructure/parsing.js";
import { saveRunArtifact } from "../infrastructure/run-store.js";

type DeliveryDependencies = {
  send?: (output: string) => Promise<void>;
  save?: typeof saveRunArtifact;
  now?: () => string;
  afterSend?: () => void;
};

export async function deliverAndRecord(
  config: AppConfig,
  audit: RunAudit,
  output: string,
  dependencies: DeliveryDependencies = {},
): Promise<void> {
  const notifier = createNotifier({ webhookUrl: config.webhookUrl });
  const send = dependencies.send ?? ((value: string) => notifier.send(value));
  const save = dependencies.save ?? saveRunArtifact;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const channel = config.webhookUrl ? "webhook" : "stdout";

  try {
    await send(output);
  } catch (error) {
    save(
      config.runLogDir,
      audit,
      {
        status: "failed",
        completedAt: now(),
        channel,
        stateStatus: "skipped",
        error: errorMessage(error),
      },
      output,
    );
    throw error;
  }

  try {
    dependencies.afterSend?.();
  } catch (error) {
    save(
      config.runLogDir,
      audit,
      {
        status: config.dryRun ? "dry-run" : "delivered",
        completedAt: now(),
        channel,
        stateStatus: "failed",
        error: errorMessage(error),
      },
      output,
    );
    throw error;
  }

  save(
    config.runLogDir,
    audit,
    {
      status: config.dryRun ? "dry-run" : "delivered",
      completedAt: now(),
      channel,
      stateStatus: dependencies.afterSend ? "updated" : "skipped",
    },
    output,
  );
}
