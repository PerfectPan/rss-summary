import {
  dailyAiCategories,
  type DailyAiEditorialItem,
  type DailyAiEvidence,
} from "../domain/daily-ai.js";
import { markdownLinkText } from "./markdown.js";

export type DailyAiDigestDocument = {
  day: string;
  items: DailyAiEditorialItem[];
  evidence: DailyAiEvidence[];
  warnings: string[];
};

export function renderDailyAiDigest(document: DailyAiDigestDocument): string {
  const lines = [
    `# Daily AI Digest · ${document.day}`,
    "",
    `${document.items.length} 条可信动态 · 来源可追溯 · 质量不足不凑数`,
    "",
  ];
  const usedRefs: string[] = [];
  for (const category of dailyAiCategories) {
    const items = document.items.filter((item) => item.category === category);
    if (items.length === 0) continue;
    lines.push(`## ${category}`, "");
    for (const item of items) {
      const numbers = item.refs.map((ref) => {
        if (!usedRefs.includes(ref)) usedRefs.push(ref);
        return usedRefs.indexOf(ref) + 1;
      });
      lines.push(
        `${items.indexOf(item) + 1}. ${item.headline} ${numbers.map((n) => `[${n}]`).join("")}`,
      );
    }
    lines.push("");
  }
  if (document.items.length === 0) lines.push("本日没有足够可信且具备明确事件信息的 AI 动态。", "");
  if (usedRefs.length > 0) {
    lines.push("## 来源", "");
    usedRefs.forEach((id, index) => {
      const source = document.evidence.find((item) => item.id === id)!;
      lines.push(
        `[${index + 1}] [${markdownLinkText(`${source.sourceName} · ${source.title}`)}](${source.url})`,
      );
    });
  }
  if (document.warnings.length > 0) lines.push("", `数据源状态：${document.warnings.join("；")}`);
  return lines.join("\n").trim();
}
