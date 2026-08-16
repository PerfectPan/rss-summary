import type { CandidateProject } from "../domain/digest.js";
import { repositoryFactsForCandidate } from "../domain/subscription-editorial.js";

export type CandidateCopy = {
  facts: string[];
  label: string;
  url: string;
  source: string;
  oneLine: string;
  summary: string;
};

export type CandidateCopyOptions = {
  editorialSummary?: string;
};

export function candidateCopy(
  candidate: CandidateProject,
  options: CandidateCopyOptions = {},
): CandidateCopy {
  const label = candidate.label ?? candidate.repo;
  const url =
    candidate.url ?? candidate.repository?.htmlUrl ?? `https://github.com/${candidate.repo}`;
  const source = candidate.actors.join(", ") || candidate.events[0]?.sourceName || "未知来源";
  const facts = repositoryFactsForCandidate(candidate);
  const oneLine = oneLineFor(candidate, label, facts);
  const fallback = candidate.repository?.description ?? oneLine;
  return {
    facts,
    label,
    url,
    source,
    oneLine,
    summary: boundedText(options.editorialSummary ?? candidate.description ?? fallback, 220),
  };
}

function oneLineFor(candidate: CandidateProject, label: string, facts: string[]): string {
  if (candidate.category === "article") return `发布了「${label}」。`;
  if (candidate.category === "release") return `发布了「${label}」。`;
  if (candidate.category === "discovery") {
    return facts.length > 0 ? `${label} · ${facts.join(" · ")}` : label;
  }
  const event = candidate.events[0];
  if (event?.type === "pull_request") {
    const number = event.prNumber ? ` #${event.prNumber}` : "";
    return `PR${number}${event.title ? ` · ${boundedText(event.title, 100)}` : ""}`;
  }
  const eventTitle = event?.title;
  return eventTitle
    ? `${candidate.repo} 更新了「${boundedText(eventTitle, 100)}」。`
    : `${candidate.repo} 有一条新的项目动态。`;
}

function boundedText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}
