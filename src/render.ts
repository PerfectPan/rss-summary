import type { CandidateProject } from "./domain.js";

export type DigestDocument = {
  generatedAt: string;
  username: string;
  candidates: CandidateProject[];
};

export function renderMarkdownDigest(document: DigestDocument): string {
  const date = document.generatedAt.slice(0, 10);
  const sections = groupCandidates(document.candidates.slice(0, 12));
  const lines = [`# GitHub Feed Digest - ${date}`, "", `账号：${document.username}`, ""];

  appendSection(lines, "值得看", sections.discovery);
  appendSection(lines, "项目动态", sections.activity);
  appendSection(lines, "版本发布", sections.release);

  if (document.candidates.length === 0) {
    lines.push("今天没有筛出高价值 GitHub Feed 项目。");
  }

  return `${lines.join("\n").trim()}\n`;
}

function groupCandidates(candidates: CandidateProject[]) {
  return {
    discovery: candidates.filter((candidate) => candidate.category === "discovery"),
    activity: candidates.filter((candidate) => candidate.category === "activity"),
    release: candidates.filter((candidate) => candidate.category === "release"),
  };
}

function appendSection(lines: string[], title: string, candidates: CandidateProject[]): void {
  if (candidates.length === 0) return;
  lines.push(`## ${title}`, "");

  candidates.forEach((candidate, index) => {
    const repository = candidate.repository;
    const url = repository?.htmlUrl ?? `https://github.com/${candidate.repo}`;
    const description = repository?.description ?? "No description.";
    const language = repository?.language ? ` · ${repository.language}` : "";
    const stars =
      typeof repository?.stargazersCount === "number"
        ? ` · ${formatCount(repository.stargazersCount)} stars`
        : "";

    lines.push(`${index + 1}. [${candidate.repo}](${url})`);
    lines.push(`   - 信号：${candidate.actors.join(", ")} · ${candidate.eventTypes.join(", ")}`);
    lines.push(`   - 简介：${description}${language}${stars}`);
    lines.push(`   - 为什么看：${candidate.reasons.slice(0, 3).join("; ")}`);

    const featured = candidate.events[0];
    if (featured?.title) {
      const eventUrl = featured.htmlUrl ?? url;
      lines.push(`   - 事件：${featured.action ?? featured.type} [${featured.title}](${eventUrl})`);
    }
    lines.push("");
  });
}

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k`;
  return String(count);
}
