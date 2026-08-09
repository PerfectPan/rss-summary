import type { CandidateProject } from "../domain/digest.js";

export type CandidateCopy = {
  label: string;
  url: string;
  source: string;
  oneLine: string;
  summary: string;
};

export function candidateCopy(candidate: CandidateProject): CandidateCopy {
  const label = candidate.label ?? candidate.repo;
  const url =
    candidate.url ?? candidate.repository?.htmlUrl ?? `https://github.com/${candidate.repo}`;
  const source = candidate.actors.join(", ") || candidate.events[0]?.sourceName || "未知来源";
  const oneLine = oneLineFor(candidate, label, source);
  const fallback = candidate.repository?.description ?? oneLine;
  return {
    label,
    url,
    source,
    oneLine,
    summary: boundedText(candidate.description ?? fallback, 220),
  };
}

function oneLineFor(candidate: CandidateProject, label: string, source: string): string {
  if (candidate.category === "article") return `${source} 发布了「${label}」。`;
  if (candidate.category === "release") return `${source} 发布了「${label}」。`;
  if (candidate.category === "discovery") return `${source} 在 GitHub Home 推荐了 ${label}。`;
  const eventTitle = candidate.events[0]?.title;
  return eventTitle
    ? `${candidate.repo} 更新了「${boundedText(eventTitle, 100)}」。`
    : `${candidate.repo} 有一条新的项目动态。`;
}

function boundedText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}
