import {
  dailyAiCategories,
  type DailyAiEditorialItem,
  type DailyAiEvidence,
} from "../domain/daily-ai.js";

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
      const badges = item.refs.map((ref) => {
        if (!usedRefs.includes(ref)) usedRefs.push(ref);
        const number = usedRefs.indexOf(ref) + 1;
        const source = document.evidence.find((evidence) => evidence.id === ref)!;
        return `[↗ #${number}](${source.url})`;
      });
      lines.push(`${items.indexOf(item) + 1}. ${item.headline} ${badges.join(" ")}`);
    }
    lines.push("");
  }
  if (document.items.length === 0) lines.push("本日没有足够可信且具备明确事件信息的 AI 动态。", "");
  if (document.warnings.length > 0) lines.push("", `数据源状态：${document.warnings.join("；")}`);
  return lines.join("\n").trim();
}
