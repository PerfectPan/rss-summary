import type { CandidateProject } from "./domain.js";

export type DigestDocument = {
  generatedAt: string;
  username: string;
  candidates: CandidateProject[];
};

export function renderMarkdownDigest(document: DigestDocument): string {
  const date = document.generatedAt.slice(0, 10);
  const sections = groupCandidates(document.candidates);
  const lines = [`# Feed Digest - ${date}`, "", `GitHub 账号：${document.username}`, ""];

  appendSection(lines, "值得看", sections.discovery);
  appendSection(lines, "RSS 文章", sections.article);
  appendSection(lines, "项目动态", sections.activity);
  appendSection(lines, "版本发布", sections.release);

  if (document.candidates.length === 0) {
    lines.push("今天没有筛出高价值 GitHub/RSS 条目。");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderJsonDigest(document: DigestDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function groupCandidates(candidates: CandidateProject[]) {
  return {
    discovery: candidates.filter((candidate) => candidate.category === "discovery"),
    article: candidates.filter((candidate) => candidate.category === "article"),
    activity: candidates.filter((candidate) => candidate.category === "activity"),
    release: candidates.filter((candidate) => candidate.category === "release"),
  };
}

function appendSection(lines: string[], title: string, candidates: CandidateProject[]): void {
  if (candidates.length === 0) return;
  lines.push(`## ${title}`, "");

  candidates.slice(0, 8).forEach((candidate, index) => {
    const repository = candidate.repository;
    const url = candidate.url ?? repository?.htmlUrl ?? `https://github.com/${candidate.repo}`;
    const label = candidate.label ?? candidate.repo;
    const description = candidate.description ?? repository?.description ?? "No description.";
    const language = repository?.language ? ` · ${repository.language}` : "";
    const stars =
      typeof repository?.stargazersCount === "number"
        ? ` · ${formatCount(repository.stargazersCount)} stars`
        : "";

    lines.push(`${index + 1}. [${label}](${url})`);
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
