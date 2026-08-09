import type { IndustryBriefDocument } from "../application/industry-brief.js";

/** Render the industry brief as Feishu-friendly Markdown; the first line becomes the card header. */
export function renderMarkdownIndustryBrief(document: IndustryBriefDocument): string {
  const date = document.displayDate ?? document.generatedAt.slice(0, 10);
  const metadata = [`${document.candidates.length} 条`, document.windowLabel]
    .filter(Boolean)
    .join(" · ");
  const lines = [`# 行业简报 · ${date}`, "", metadata, ""];

  if (document.candidates.length === 0) {
    lines.push("今天没有筛出高价值的行业动态。");
  } else {
    document.candidates.slice(0, 20).forEach((candidate, index) => {
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
  }

  return `${lines.join("\n").trim()}\n`;
}
