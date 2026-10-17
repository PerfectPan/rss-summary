import { Context, Effect } from "effect";

import type { FeedState } from "../domain/ledger/index.js";
import type { DailyAiDeliveryReceipt } from "../domain/receipt/index.js";
import type { RunAudit, RunDelivery, StoredRunAudit } from "../domain/run-audit/index.js";

/**
 * Sends rendered output. Implementations always write to stdout; a configured
 * webhook is posted afterwards. `channel` reports how the run was delivered so
 * audit records stay accurate without callers knowing the wiring.
 */
export class Notifier extends Context.Service<
  Notifier,
  {
    readonly channel: "stdout" | "webhook";
    readonly send: (markdown: string) => Effect.Effect<void, Error>;
  }
>()("rss-summary/delivery/Notifier/v1") {}

/** Persists the delivery ledger (`feed-state.json` and friends). */
export class FeedStateStore extends Context.Service<
  FeedStateStore,
  {
    readonly load: (path: string) => Effect.Effect<FeedState, Error>;
    readonly save: (path: string, state: FeedState) => Effect.Effect<void, Error>;
  }
>()("rss-summary/delivery/FeedStateStore/v1") {}

export type SavedRunArtifact = {
  jsonPath: string;
  markdownPath: string;
};

/** Stores and reads run artifacts (paired JSON + Markdown files). */
export class RunArchive extends Context.Service<
  RunArchive,
  {
    readonly save: (
      root: string,
      audit: RunAudit,
      delivery: RunDelivery,
      markdown: string,
    ) => Effect.Effect<SavedRunArtifact, Error>;
    readonly list: (root: string) => Effect.Effect<readonly string[], Error>;
    readonly load: (path: string) => Effect.Effect<StoredRunAudit, Error>;
    readonly label: (path: string) => string;
  }
>()("rss-summary/delivery/RunArchive/v1") {}

/**
 * Structurally equivalent to the Daily AI digest result persisted by the
 * diagnostics file. Defined here so delivery does not depend on the legacy
 * application layer; the search provider usage fields stay opaque.
 */
export type DailyAiDiagnosticSnapshot = {
  occurrence: string;
  phase: "collect" | "render";
  result: {
    evidence: Array<{
      id: string;
      title: string;
      url: string;
      publishedAt: string;
      excerpt: string;
      tier: "official" | "authoritative" | "aggregator" | "unverified";
      sourceName: string;
      topicId?: string;
    }>;
    items: Array<{
      category: "概览/要闻" | "模型发布" | "开发生态" | "产品应用" | "行业动态" | "技术与洞察";
      headline: string;
      refs: string[];
    }>;
    audit: {
      decisions: Array<{
        evidenceIds: string[];
        status: "selected" | "filtered" | "merged";
        reason: string;
      }>;
      editorialIssues: Array<{
        index: number;
        refs: string[];
        reason:
          | "invalid-draft"
          | "invalid-item"
          | "invalid-category"
          | "invalid-headline"
          | "unknown-reference";
        message: string;
      }>;
    };
    day: string;
    windowLabel: string;
    generatedAt: string;
    warnings: string[];
    sourceAudit: {
      xAccounts: Array<{
        handle: string;
        status: "ok" | "failed";
        acceptedCount: number;
        limitReached?: boolean;
        errorCode?: string;
        grok?: unknown;
        searchUsage?: unknown;
      }>;
      industry?: RunAudit;
    };
    deliveryReceipt: DailyAiDeliveryReceipt;
  };
};

/** Preserves recovery evidence locally without adding it to tool messages. */
export class DiagnosticsStore extends Context.Service<
  DiagnosticsStore,
  {
    readonly save: (snapshot: DailyAiDiagnosticSnapshot) => Effect.Effect<void, Error>;
  }
>()("rss-summary/delivery/DiagnosticsStore/v1") {}
