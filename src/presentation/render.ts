import type { DigestDocument } from "../domain/digest.js";
import { renderCandidateBrief } from "./candidate-brief.js";

export type { DigestDocument };

export function renderMarkdownDigest(
  document: DigestDocument,
  options: { summaries?: ReadonlyMap<string, string> } = {},
): string {
  const date = document.displayDate ?? document.generatedAt.slice(0, 10);
  const publishableCount = document.candidates.filter(
    (candidate) => candidate.category !== "paper",
  ).length;
  const pendingPapers = document.candidates.length - publishableCount;
  const sourceLabel = document.sourceMode === "rss" ? "个人博客" : "GitHub Home + 个人博客";
  const metadata = [
    `${publishableCount} 条更新`,
    pendingPapers > 0 ? `${pendingPapers} 篇论文待研究` : undefined,
    sourceLabel,
    document.windowLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  return renderCandidateBrief({
    header: `# 我的订阅 · ${date}`,
    metadata,
    candidates: document.candidates,
    featuredTitle: "重点摘要",
    compactTitle: "其他更新",
    emptyMessage: "今天没有新的订阅内容。",
    pendingMessage: (count) => `另有 ${count} 篇论文等待原文核验，暂不直接推送。`,
    summaries: options.summaries,
  });
}

export function renderJsonDigest(document: DigestDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
