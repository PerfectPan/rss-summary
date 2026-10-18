import type { RivusToolDescriptor } from "@rivus/agent";

import { dailyAiCategories } from "../../../editorial/index.js";
import { createRivusDailyAiDigestExecutor } from "../../rivus/phases.js";

export const RSS_SUMMARY_DAILY_AI_TOOL_ID = "rss-summary/generate-daily-ai-digest";
export const dailyAiEditorialPolicy = [
  "按用户影响筛选和排序，不设固定条数目标；优先模型能力、产品功能、研究结论、价格与安全变化，不凑数。",
  "CLI 和开发工具的 alpha、beta、preview、rc、nightly 若只有版本号、构建号或发布日期，直接跳过；正式版若同样没有具体变化也跳过。预发布仅在证据明确支持重要功能、安全修复或破坏性变化时保留，并标明预发布。",
  "同一工具的多个版本和同一份 release notes 合并成一条，只写最重要的具体变化，不拆成多条占满日报。",
  "headline 直接说明主体、具体变化及其适用范围或影响，90 字以内；不能只写发布了某版本，也不能从版本号推测功能。",
  "refs 必须逐字使用 evidence.id，不要使用 URL 或自行编造引用。",
  "X 内容经 Grok 整理，未独立核验；保留作者归属，不将个人说法改写成已确认事实。发布时间不等于事件发生时间；旧事件的新转发不能写成今日新发布。",
  "若全部候选都没有值得推送的变化，返回空数组 []；不要为避免空结果而选入低信息量条目。",
].join("\n");

export const dailyAiToolDescriptor: Pick<
  RivusToolDescriptor,
  "description" | "digest" | "idempotency" | "inputSchema" | "risk" | "version"
> = {
  description:
    "Generate a source-grounded Daily AI Digest for the rolling 24 hours before the occurrence",
  digest: "sha256:rss-summary-generate-daily-ai-digest-v8",

  idempotency: "none",
  inputSchema: {
    additionalProperties: false,
    properties: {
      draft: {
        description:
          "Editorial Array<{category, headline, refs}> produced only from collect evidence; required for render; [] when no meaningful updates",
        items: {
          additionalProperties: false,
          properties: {
            category: { enum: [...dailyAiCategories], type: "string" },
            headline: { description: "At most 90 characters", maxLength: 90, type: "string" },
            refs: {
              description: "Exact evidence.id values from collect, never URLs",
              items: { type: "string" },
              minItems: 1,
              type: "array",
            },
          },
          required: ["category", "headline", "refs"],
          type: "object",
        },
        type: "array",
      },
      occurrence: { format: "date-time", type: "string" },
      phase: { enum: ["collect", "render"], type: "string" },
    },
    required: ["occurrence", "phase"],
    type: "object",
  },
  risk: "observe",
  version: "1.4.0",
};

/** Default executor: the two-phase protocol with diagnostics snapshots. */
export function createDailyAiToolExecutor() {
  return createRivusDailyAiDigestExecutor();
}
