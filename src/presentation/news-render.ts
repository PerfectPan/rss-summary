import { displayTime, markdownLinkText } from "./markdown.js";
import type { SelectedNewsStory } from "../domain/news.js";
import type { NewsTopic } from "../domain/news.js";

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
    lines.push(`**${topicIcon(topic.id)} ${shortTopicLabel(topic.label)} · ${stories.length}**`, "");
    stories.forEach((story, index) => appendStory(lines, story, index + 1));
  }

  if (document.stories.length === 0) {
    lines.push("本时段没有筛出经过时间和来源校验的高信号热点。", "");
  }
  if (document.warnings.length > 0) {
    lines.push(`数据源状态：${document.warnings.join("；")}`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function appendStory(lines: string[], story: SelectedNewsStory, index: number): void {
  lines.push(`**${index}. [${markdownLinkText(story.title)}](${story.canonicalUrl})**`);
  lines.push(story.summary);
  lines.push(`${story.siteName} · ${displayTime(story.publishTime) ?? story.publishTime}`, "");
}

function topicIcon(topicId: string): string {
  if (topicId === "technology") return "💻";
  if (topicId === "politics") return "🌍";
  return "📰";
}

function shortTopicLabel(value: string): string {
  return value.replace(/新闻$/u, "");
}
