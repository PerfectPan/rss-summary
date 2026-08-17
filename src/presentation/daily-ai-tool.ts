import { generateDailyAiDigest, type DailyAiDigestResult } from "../application/daily-ai-digest.js";
import { createDailyAiDeliveryReceipt } from "../application/daily-ai-receipt.js";
import { buildDailyAiDigest, dailyAiCategories } from "../domain/daily-ai.js";
import { renderDailyAiDigest } from "./daily-ai-render.js";

type RivusDailyAiResult = DailyAiDigestResult & { markdown: string };

export type RivusDailyAiToolResult =
  | {
      phase: "collect";
      day: string;
      generatedAt: string;
      evidence: DailyAiDigestResult["evidence"];
      warnings: string[];
      editorialContract: {
        categories: readonly string[];
        itemTarget: string;
        outputShape: string;
      };
    }
  | (RivusDailyAiResult & { phase: "render"; itemCount: number });

type DailyAiExecutorDependencies = {
  collect?: (value: unknown) => Promise<DailyAiDigestResult>;
};

export function createRivusDailyAiDigestExecutor(
  dependencies: DailyAiExecutorDependencies = {},
): (value: unknown) => Promise<RivusDailyAiToolResult> {
  const collect = dependencies.collect ?? generateDailyAiDigest;
  const cache = new Map<string, DailyAiDigestResult>();

  return async (value) => {
    const input = parseToolInput(value);
    let collected = cache.get(input.occurrence);
    if (input.phase === "collect" || !collected) {
      collected = await collect({ occurrence: input.occurrence });
      cache.set(input.occurrence, collected);
      trimCache(cache);
    }
    if (input.phase === "collect") {
      return {
        phase: "collect",
        day: collected.day,
        generatedAt: collected.generatedAt,
        evidence: collected.evidence,
        warnings: collected.warnings,
        editorialContract: {
          categories: dailyAiCategories,
          itemTarget: "12–24; quality is a ceiling, never a fill quota",
          outputShape: "Array<{category, headline, refs}>",
        },
      };
    }

    const digest = buildDailyAiDigest(collected.evidence, {
      draft: input.draft,
      research: input.research,
    });
    const result = {
      ...collected,
      ...digest,
      deliveryReceipt: createDailyAiDeliveryReceipt(
        input.occurrence,
        digest.items.flatMap(({ refs }) => refs),
      ),
    };
    cache.delete(input.occurrence);
    return {
      ...result,
      phase: "render",
      itemCount: result.items.length,
      markdown: renderDailyAiDigest({
        day: result.day,
        items: result.items,
        evidence: result.evidence,
        warnings: result.warnings,
      }),
    };
  };
}

function parseToolInput(value: unknown): {
  occurrence: string;
  phase: "collect" | "render";
  draft?: unknown;
  research?: unknown;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Daily AI Tool input must be an object.");
  const record = value as Record<string, unknown>;
  const occurrence = record.occurrence;
  if (typeof occurrence !== "string" || !Number.isFinite(Date.parse(occurrence)))
    throw new Error("occurrence must be a valid date-time.");
  if (record.phase !== "collect" && record.phase !== "render")
    throw new Error("phase must be collect or render.");
  return {
    occurrence,
    phase: record.phase,
    draft: record.draft,
    research: record.research,
  };
}

function trimCache(cache: Map<string, DailyAiDigestResult>): void {
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
}
