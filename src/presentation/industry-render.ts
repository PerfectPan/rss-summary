import type { IndustryBriefDocument } from "../application/industry-brief.js";

/** Render the industry brief as Feishu-friendly Markdown; the first line becomes the card header. */
export function renderMarkdownIndustryBrief(document: IndustryBriefDocument): string {
  const date = document.displayDate ?? document.generatedAt.slice(0, 10);
  const publishableCandidates = document.candidates.filter(
    (candidate) => candidate.category !== "paper",
  );
  const pendingPaperCount = document.candidates.length - publishableCandidates.length;
  const metadata = [
    `${publishableCandidates.length} 条`,
    pendingPaperCount > 0 ? `${pendingPaperCount} 篇论文待深度调研` : undefined,
    document.windowLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [`# 行业简报 · ${date}`, "", metadata, ""];

  if (publishableCandidates.length === 0 && pendingPaperCount === 0) {
    lines.push("今天没有筛出高价值的行业动态。");
  } else {
    publishableCandidates.slice(0, 20).forEach((candidate, index) => {
      const label = candidate.label ?? candidate.repo;
      const url = candidate.url ?? `https://github.com/${candidate.repo}`;
      lines.push(`**${index + 1}. [${label}](${url})**`);
      if (candidate.description) {
        lines.push(`- 摘要：${candidate.description}`);
      }
      lines.push(`- 来源：${candidate.actors.join(", ")}`);
      lines.push(`- 为什么看：${candidate.reasons.slice(0, 3).join("；")}`);
      lines.push("");
    });
    if (pendingPaperCount > 0) {
      lines.push(
        `另有 ${pendingPaperCount} 篇论文进入研究队列；未完成 abstract 与原文核验前不直接发布。`,
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderJsonIndustryBrief(document: IndustryBriefDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
