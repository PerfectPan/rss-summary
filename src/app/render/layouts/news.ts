import type {
  NewsBriefEdition,
  NewsSourceStatus,
  SelectedNewsStory,
} from "../../../editorial/index.js";
import type { NewsTopic } from "../../products/news/output.js";
import { displayTime, markdownLinkText } from "../markdown.js";
import type { ViewDocument, ViewItem } from "../view.js";

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

/** Lay a noon/evening news brief out as a View IR document. */
export function newsView(document: NewsBriefDocument): ViewDocument {
  const title = document.edition === "noon" ? "午间热点" : "晚间热点";
  const sections = document.topics
    .filter(({ enabled }) => enabled)
    .map((topic) => {
      const stories = document.stories.filter(
        ({ selectedTopicId }) => selectedTopicId === topic.id,
      );
      return {
        heading: `${topic.icon} ${shortTopicLabel(topic.label)} · ${stories.length}`,
        style: "strong" as const,
        items: stories.map((story, index) => cardItem(story, index + 1)),
      };
    })
    .filter((section) => section.items.length > 0);
  const trailing = [
    ...(document.stories.length === 0
      ? [{ kind: "plain" as const, text: emptyNewsMessage(document.sourceStatus) }]
      : []),
    ...(document.warnings.length > 0
      ? [{ kind: "status" as const, text: `数据源状态：${document.warnings.join("；")}` }]
      : []),
    ...(!document.warnings.length && document.sourceStatus?.notes.length
      ? [{ kind: "plain" as const, text: `采集说明：${document.sourceStatus.notes.join("；")}` }]
      : []),
  ];
  return {
    title: `${title} · ${document.day}`,
    meta: [`${document.stories.length} 条重要动态 · ${document.windowLabel}`],
    sections,
    trailing,
    variant: "news",
  };
}

function cardItem(story: SelectedNewsStory, number: number): ViewItem {
  const time = /^\d{4}-\d{2}-\d{2}$/u.test(story.publishTime)
    ? `${story.publishTime}（仅日期）`
    : (displayTime(story.publishTime) ?? story.publishTime);
  return {
    shape: "card",
    number,
    headline: markdownLinkText(story.title),
    links: [{ text: markdownLinkText(story.title), url: story.canonicalUrl }],
    notes: [story.summary, `${story.siteName} · ${time}`],
  };
}

function emptyNewsMessage(sourceStatus: NewsSourceStatus | undefined): string {
  if (sourceStatus?.state === "unavailable") return "本期资讯采集未完成，无法判断是否有新增。";
  if (sourceStatus?.state === "partial") {
    return "已完成采集的范围内未发现符合条件的新资讯；部分来源尚未完成。";
  }
  return "本期未发现符合条件的新资讯。";
}

function shortTopicLabel(value: string): string {
  return value.replace(/新闻$/u, "");
}
