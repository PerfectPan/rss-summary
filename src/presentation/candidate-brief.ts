import { presentationDepthForCandidate } from "../domain/attention.js";
import type { CandidateProject } from "../domain/digest.js";
import { candidateCopy } from "./candidate-copy.js";

export type CandidateBriefOptions = {
  header: string;
  metadata: string;
  candidates: CandidateProject[];
  featuredTitle: string;
  compactTitle: string;
  emptyMessage: string;
  pendingMessage: (count: number) => string;
};

export function renderCandidateBrief(options: CandidateBriefOptions): string {
  const publishable = options.candidates.filter((candidate) => candidate.category !== "paper");
  const featured = publishable.filter(
    (candidate) => presentationDepthForCandidate(candidate) === "summary",
  );
  const compact = publishable.filter(
    (candidate) => presentationDepthForCandidate(candidate) === "link",
  );
  const pendingPapers = options.candidates.length - publishable.length;
  const lines = [options.header, "", options.metadata, ""];

  appendSummaries(lines, options.featuredTitle, featured);
  appendLinks(lines, options.compactTitle, compact);

  if (publishable.length === 0 && pendingPapers === 0) lines.push(options.emptyMessage);
  if (pendingPapers > 0) lines.push(options.pendingMessage(pendingPapers));

  return `${lines.join("\n").trim()}\n`;
}

function appendSummaries(lines: string[], title: string, candidates: CandidateProject[]): void {
  if (candidates.length === 0) return;
  lines.push(`**${title}**`, "");
  for (const candidate of candidates.slice(0, 8)) {
    const copy = candidateCopy(candidate);
    lines.push(`**[${copy.label}](${copy.url})**`);
    lines.push(copy.summary);
    lines.push(`来源：${copy.source}`, "");
  }
}

function appendLinks(lines: string[], title: string, candidates: CandidateProject[]): void {
  if (candidates.length === 0) return;
  lines.push(`**${title}**`, "");
  for (const candidate of candidates.slice(0, 20)) {
    const copy = candidateCopy(candidate);
    lines.push(`- ${copy.oneLine}[查看原文](${copy.url})`);
  }
  lines.push("");
}
