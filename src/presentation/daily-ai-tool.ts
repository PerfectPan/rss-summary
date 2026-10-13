import { generateDailyAiDigest, type DailyAiDigestResult } from "../application/daily-ai-digest.js";
import { createDailyAiDeliveryReceipt } from "../application/daily-ai-receipt.js";
import { buildDailyAiDigest, dailyAiCategories, dailyAiItemLimit } from "../domain/daily-ai.js";
import { renderDailyAiDigest } from "./daily-ai-render.js";

type RivusDailyAiResult = DailyAiDigestResult & { markdown: string };

export const dailyAiEditorialPolicy = [
  `最多 ${dailyAiItemLimit} 条，按用户影响排序；优先模型能力、产品功能、研究结论、价格与安全变化，不凑数。`,
  "CLI 和开发工具的 alpha、beta、preview、rc、nightly 若只有版本号、构建号或发布日期，直接跳过；正式版若同样没有具体变化也跳过。预发布仅在证据明确支持重要功能、安全修复或破坏性变化时保留，并标明预发布。",
  "同一工具的多个版本和同一份 release notes 合并成一条，只写最重要的 1–2 个变化；CLI 版本更新合计最多 2 条，不拆成多条占满日报。",
  "headline 直接说明主体、具体变化及其适用范围或影响，90 字以内；不能只写发布了某版本，也不能从版本号推测功能。",
  "若全部候选都没有值得推送的变化，返回空数组 []；不要为避免空结果而选入低信息量条目。",
].join("\n");

export type RivusDailyAiToolResult =
  | {
      phase: "collect";
      day: string;
      windowLabel: string;
      generatedAt: string;
      evidence: DailyAiDigestResult["evidence"];
      warnings: string[];
      sourceAudit: DailyAiDigestResult["sourceAudit"];
      editorialContract: {
        categories: readonly string[];
        itemTarget: string;
        outputShape: string;
        selectionPolicy: string;
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
        windowLabel: collected.windowLabel,
        generatedAt: collected.generatedAt,
        evidence: collected.evidence,
        warnings: collected.warnings,
        sourceAudit: collected.sourceAudit,
        editorialContract: {
          categories: dailyAiCategories,
          itemTarget: `0–${dailyAiItemLimit}; quality is a ceiling, never a fill quota`,
          outputShape: "Array<{category, headline, refs}>",
          selectionPolicy: dailyAiEditorialPolicy,
        },
      };
    }

    const digest = buildDailyAiDigest(collected.evidence, { draft: input.draft });
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
        windowLabel: result.windowLabel,
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
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Daily AI Tool input must be an object.");
  const record = value as Record<string, unknown>;
  const occurrence = record.occurrence;
  if (typeof occurrence !== "string" || !Number.isFinite(Date.parse(occurrence)))
    throw new Error("occurrence must be a valid date-time.");
  if (record.phase !== "collect" && record.phase !== "render")
    throw new Error("phase must be collect or render.");
  return { occurrence, phase: record.phase, draft: record.draft };
}

function trimCache(cache: Map<string, DailyAiDigestResult>): void {
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
}
