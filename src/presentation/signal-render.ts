import type { SignalItem } from "../domain/signal.js";
import { endOfCalendarDay } from "../domain/time.js";
import type { SignalBriefOutput, SignalBriefResult } from "../application/signal-brief.js";
import { displayTime, formatStarCount, markdownLinkText } from "./markdown.js";

export type SignalBriefDocument = {
  day: string;
  updates: SignalItem[];
  opensource: SignalItem[];
  warnings: string[];
  timezoneOffset: string;
};

/** Attach Markdown to an application-layer signal brief result. */
export function withSignalMarkdown(result: SignalBriefResult): SignalBriefOutput {
  return {
    ...result,
    markdown: renderSignalBrief({
      day: result.day,
      updates: result.updates,
      opensource: result.opensource,
      warnings: result.warnings,
      timezoneOffset: result.timezoneOffset,
    }),
  };
}

export function renderSignalBrief(document: SignalBriefDocument): string {
  const dayEnd = endOfCalendarDay(document.day, document.timezoneOffset);
  const lines = [`# 高信号速览 · ${document.day}`, ""];

  if (document.updates.length > 0) {
    lines.push(`**动态 · ${document.updates.length}**`, "");
    document.updates.forEach((item, index) => appendUpdate(lines, item, index + 1));
  }

  if (document.opensource.length > 0) {
    lines.push(`**开源 · ${document.opensource.length}**`, "");
    document.opensource.forEach((item, index) => appendRepo(lines, item, index + 1, dayEnd));
  }

  if (document.updates.length === 0 && document.opensource.length === 0) {
    lines.push("本日没有筛出经过多源校验的高信号模型、产品或开源仓库。", "");
  }
  if (document.warnings.length > 0) {
    lines.push(`数据源状态：${document.warnings.join("；")}`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function appendUpdate(lines: string[], item: SignalItem, index: number): void {
  lines.push(
    `${index}. **[${kindLabel(item.kind)}] [${markdownLinkText(item.title)}](${item.url})**`,
    item.summary,
    `${item.sourceLabel}${timeSuffix(item.publishedAt)}`,
    "",
  );
}

function appendRepo(lines: string[], item: SignalItem, index: number, dayEnd: number): void {
  lines.push(
    `${index}. **[${kindLabel(item.kind)}] [${markdownLinkText(item.title)}](${item.url})**`,
    item.summary,
    repoMetricsLine(item, dayEnd),
    "",
  );
}

function kindLabel(kind: SignalItem["kind"]): string {
  if (kind === "model") return "模型";
  if (kind === "product") return "产品";
  if (kind === "release") return "版本";
  return "上升";
}

function repoMetricsLine(item: SignalItem, dayEnd: number): string {
  const parts: string[] = [];
  const createdAt = item.metrics?.createdAt;
  if (createdAt) {
    const ageDays = Math.max(0, Math.floor((dayEnd - Date.parse(createdAt)) / 86_400_000));
    parts.push(ageDays === 0 ? "今日" : `${ageDays}d`);
  }
  if (item.metrics?.stars !== undefined) parts.push(`${formatStarCount(item.metrics.stars)}★`);
  if (item.metrics?.language) parts.push(item.metrics.language);
  return parts.join(" · ") || "GitHub";
}

function timeSuffix(publishedAt: string | undefined): string {
  const time = displayTime(publishedAt);
  return time ? ` · ${time}` : "";
}
