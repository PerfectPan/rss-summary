import type { CandidateProject } from "../domain/digest.js";

export type DigestDocument = {
  generatedAt: string;
  displayDate?: string;
  username: string;
  sourceMode?: "mixed" | "rss";
  windowLabel?: string;
  candidates: CandidateProject[];
};

export function renderMarkdownDigest(document: DigestDocument): string {
  const date = document.displayDate ?? document.generatedAt.slice(0, 10);
  const sections = groupCandidates(document.candidates);
  const sourceLabel = document.sourceMode === "rss" ? "RSS" : "GitHub + RSS";
  const metadata = [`${document.candidates.length} 条高信号`, sourceLabel, document.windowLabel]
    .filter(Boolean)
    .join(" · ");
  const lines = [`# 技术订阅日报 · ${date}`, "", metadata, ""];

  appendSection(lines, "🔥 值得看", sections.discovery);
  appendSection(lines, "📚 RSS 文章", sections.article);
  appendSection(lines, "🛠 项目动态", sections.activity);
  appendSection(lines, "🚀 版本发布", sections.release);

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
  lines.push(`**${title}**`, "");

  candidates.slice(0, 8).forEach((candidate, index) => {
    const repository = candidate.repository;
    const url = candidate.url ?? repository?.htmlUrl ?? `https://github.com/${candidate.repo}`;
    const label = candidate.label ?? candidate.repo;
    const description = boundedText(candidate.description ?? repository?.description ?? "暂无可用简介。", 240);
    const language = repository?.language ? ` · ${repository.language}` : "";
    const stars =
      typeof repository?.stargazersCount === "number"
        ? ` · ${formatCount(repository.stargazersCount)} stars`
        : "";

    lines.push(`**${index + 1}. ${label}**`);
    lines.push(`- 简介：${description}${language}${stars}`);
    lines.push(`- 信号：${candidate.actors.join(", ")} · ${candidate.eventTypes.map(eventTypeLabel).join(", ")}`);
    lines.push(`- 为什么看：${candidate.reasons.slice(0, 3).map(reasonLabel).join("；")}`);

    const featured = candidate.events[0];
    if (featured?.title) {
      const eventUrl = featured.htmlUrl ?? url;
      lines.push(`- 事件：${featured.action ?? eventTypeLabel(featured.type)} · ${boundedText(featured.title, 120)}`);
      if (eventUrl !== url) lines.push(`- [查看事件](${eventUrl})`);
    }
    lines.push(`- [查看原文](${url})`, "");
  });
}

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k`;
  return String(count);
}

function boundedText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function eventTypeLabel(value: CandidateProject["eventTypes"][number]): string {
  const labels: Record<CandidateProject["eventTypes"][number], string> = {
    announcement: "公告",
    article: "文章",
    create: "新建项目",
    follow: "关注",
    fork: "派生项目",
    other: "动态",
    pull_request: "Pull Request",
    recommendation: "推荐",
    release: "版本发布",
    trending: "趋势项目",
    watch: "收藏",
  };
  return labels[value];
}

function reasonLabel(value: string): string {
  const exact: Record<string, string> = {
    "followee starred this repository": "关注者收藏了这个项目",
    "GitHub Home trending repository": "GitHub Home 趋势项目",
    "GitHub Home recommendation": "GitHub Home 推荐",
    "new release published": "发布了新版本",
    "followed actor forked repository": "关注者派生了这个项目",
    "new repository created": "新项目创建",
    "follow relationship from GitHub Home": "GitHub Home 关注信号",
    "GitHub Home announcement": "GitHub Home 公告",
    "important PR merged": "重要 Pull Request 已合并",
    "multiple followed signals": "多个关注信号同时出现",
    "recently active repository": "项目近期保持活跃",
  };
  if (exact[value]) return exact[value];
  if (value.startsWith("followed actor: ")) return `关注者：${value.slice("followed actor: ".length)}`;
  if (value.startsWith("matches interest: ")) return `匹配关注方向：${value.slice("matches interest: ".length)}`;
  if (value.startsWith("rss feed: ")) return `RSS 来源：${value.slice("rss feed: ".length)}`;
  return value;
}
