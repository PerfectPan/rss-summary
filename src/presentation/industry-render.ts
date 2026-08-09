import type { IndustryBriefDocument } from "../application/industry-brief.js";
import { renderCandidateBrief } from "./candidate-brief.js";

/** Render the frontier brief as Feishu-friendly Markdown. */
export function renderMarkdownIndustryBrief(document: IndustryBriefDocument): string {
  const date = document.displayDate ?? document.generatedAt.slice(0, 10);
  const publishableCount = document.candidates.filter(
    (candidate) => candidate.category !== "paper",
  ).length;
  const pendingPapers = document.candidates.length - publishableCount;
  const metadata = [
    `${publishableCount} 条动态`,
    pendingPapers > 0 ? `${pendingPapers} 篇论文待研究` : undefined,
    document.windowLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  return renderCandidateBrief({
    header: `# 行业前沿 · ${date}`,
    metadata,
    candidates: document.candidates,
    featuredTitle: "值得展开",
    compactTitle: "动态速览",
    emptyMessage: "今天没有新的行业前沿动态。",
    pendingMessage: (count) => `另有 ${count} 篇论文等待原文核验，暂不直接推送。`,
  });
}

export function renderJsonIndustryBrief(document: IndustryBriefDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
