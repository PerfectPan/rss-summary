import { generateDailyAiDigest, type DailyAiDigestResult } from "../application/daily-ai-digest.js";
import { renderDailyAiDigest } from "./daily-ai-render.js";

export type RivusDailyAiResult = DailyAiDigestResult & { markdown: string };

export async function generateRivusDailyAiDigest(value: unknown): Promise<RivusDailyAiResult> {
  const result = await generateDailyAiDigest(value);
  return {
    ...result,
    markdown: renderDailyAiDigest({
      day: result.day,
      items: result.items,
      evidence: result.evidence,
      warnings: result.warnings,
    }),
  };
}
