import type { SelectedNewsStory } from "./news-domain.js";
import type { NewsTopic } from "./news-topics.js";

export type NewsBriefEdition = "noon" | "evening";

export type NewsBriefDocument = {
  day: string;
  edition: NewsBriefEdition;
  generatedAt: string;
  stories: SelectedNewsStory[];
  topics: NewsTopic[];
  warnings: string[];
  windowLabel: string;
};

export function renderNewsBrief(document: NewsBriefDocument): string {
  const title = document.edition === "noon" ? "午间热点" : "晚间热点";
  const lines = [
    `# ${title} · ${document.day}`,
    "",
    `${document.stories.length} 条高信号 · ${document.windowLabel}`,
    "",
  ];

  for (const topic of document.topics.filter(({ enabled }) => enabled)) {
    const stories = document.stories.filter(({ selectedTopicId }) => selectedTopicId === topic.id);
    if (stories.length === 0) continue;
    lines.push(`**${topicIcon(topic.id)} ${topic.label}**`, "");
    stories.forEach((story, index) => appendStory(lines, story, index + 1, topic.id));
  }

  if (document.stories.length === 0) {
    lines.push("本时段没有筛出经过时间和来源校验的高信号热点。", "");
  }
  if (document.warnings.length > 0) {
    lines.push(`数据源状态：${document.warnings.join("；")}`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function appendStory(lines: string[], story: SelectedNewsStory, index: number, topicId: string): void {
  lines.push(`**${index}. ${story.title}**`);
  lines.push(`- 发生了什么：${story.summary}`);
  lines.push(`- 为什么看：${whyItMatters(story)}`);
  lines.push(`- 来源：${story.siteName} · ${displayTime(story.publishTime)} · ${story.authInfoDescription ?? "已校验来源"}`);
  lines.push(`- 建议：${topicId === "politics" ? "关注后续官方进展" : "阅读原文"}`);
  lines.push(`- [查看原文](${story.canonicalUrl})`, "");
}

function whyItMatters(story: SelectedNewsStory): string {
  if (story.queryHits > 1) return `被 ${story.queryHits} 个独立主题查询同时命中，且来源权威度满足本栏目要求。`;
  if (story.authInfoLevel === 1) return "来自非常权威信源，适合作为已确认事实继续跟踪。";
  return "搜索相关度较高，且来源权威度满足本栏目要求。";
}

function topicIcon(topicId: string): string {
  if (topicId === "technology") return "💻";
  if (topicId === "politics") return "🌍";
  return "📰";
}

function displayTime(value: string): string {
  const match = /[T ](\d{2}:\d{2})/u.exec(value);
  return match?.[1] ?? value;
}
