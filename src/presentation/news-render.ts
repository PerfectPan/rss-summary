import type { NewsSourceStatus } from "../application/news-audit.js";
import { displayTime, markdownLinkText } from "./markdown.js";
import type { NewsBriefEdition, NewsTopic, SelectedNewsStory } from "../domain/news.js";

export type { NewsBriefEdition };

export type NewsBriefDocument = {
  day: string;
  edition: NewsBriefEdition;
  generatedAt: string;
  stories: SelectedNewsStory[];
  topics: NewsTopic[];
  warnings: string[];
  sourceStatus?: NewsSourceStatus;
  windowLabel: string;
};

export function renderNewsBrief(document: NewsBriefDocument): string {
  const title = document.edition === "noon" ? "午间热点" : "晚间热点";
  const lines = [
    `# ${title} · ${document.day}`,
    "",
    `${document.stories.length} 条重要动态 · ${document.windowLabel}`,
    "",
  ];

  for (const topic of document.topics.filter(({ enabled }) => enabled)) {
    const stories = document.stories.filter(({ selectedTopicId }) => selectedTopicId === topic.id);
    if (stories.length === 0) continue;
    lines.push(`**${topic.icon} ${shortTopicLabel(topic.label)} · ${stories.length}**`, "");
    stories.forEach((story, index) => appendStory(lines, story, index + 1));
  }

  if (document.stories.length === 0) {
    lines.push(
      document.sourceStatus?.state === "unavailable"
        ? "本期资讯采集失败，无法判断是否有新增。"
        : document.sourceStatus?.state === "partial"
          ? "已完成采集的范围内未发现符合条件的新资讯；部分来源尚未完成。"
          : "本期未发现符合条件的新资讯。",
      "",
    );
  }
  if (document.warnings.length > 0) {
    lines.push(`数据源状态：${document.warnings.join("；")}`, "");
  }
  if (!document.warnings.length && document.sourceStatus?.notes.length) {
    lines.push(`采集说明：${document.sourceStatus.notes.join("；")}`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function appendStory(lines: string[], story: SelectedNewsStory, index: number): void {
  lines.push(`**${index}. [${markdownLinkText(story.title)}](${story.canonicalUrl})**`);
  lines.push(story.summary);
  lines.push(
    `${story.siteName} · ${/^\d{4}-\d{2}-\d{2}$/u.test(story.publishTime) ? `${story.publishTime}（仅日期）` : (displayTime(story.publishTime) ?? story.publishTime)}`,
    "",
  );
}

function shortTopicLabel(value: string): string {
  return value.replace(/新闻$/u, "");
}
