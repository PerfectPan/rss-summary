import {
  dailyAiCategories,
  type DailyAiEditorialItem,
  type DailyAiEvidence,
} from "../../../editorial/index.js";
import type { ViewDocument, ViewItem } from "../view.js";

export type DailyAiDigestDocument = {
  day: string;
  windowLabel: string;
  items: DailyAiEditorialItem[];
  evidence: DailyAiEvidence[];
  warnings: string[];
};

/** Lay the Daily AI digest out as a View IR document with global ref numbers. */
export function dailyAiView(document: DailyAiDigestDocument): ViewDocument {
  const usedRefs: string[] = [];
  const sections = dailyAiCategories
    .map((category) => ({
      heading: category,
      style: "atx" as const,
      items: document.items
        .filter((item) => item.category === category)
        .map((item, index) => numberedItem(document.evidence, usedRefs, item, index + 1)),
    }))
    .filter((section) => section.items.length > 0);
  const trailing = [
    ...(document.items.length === 0
      ? [{ kind: "plain" as const, text: "本日没有足够可信且具备明确事件信息的 AI 动态。" }]
      : []),
    ...(document.warnings.length > 0
      ? [{ kind: "status" as const, text: `数据源状态：${document.warnings.join("；")}` }]
      : []),
  ];
  return {
    title: `Daily AI Digest · ${document.day}`,
    meta: [
      `${document.items.length} 条 AI 动态 · ${document.windowLabel} · 来源可追溯 · 质量不足不凑数`,
    ],
    sections,
    trailing,
    variant: "daily-ai",
  };
}

function numberedItem(
  evidence: DailyAiEvidence[],
  usedRefs: string[],
  item: DailyAiEditorialItem,
  number: number,
): ViewItem {
  const links = item.refs.map((ref) => {
    if (!usedRefs.includes(ref)) usedRefs.push(ref);
    const refNumber = usedRefs.indexOf(ref) + 1;
    const source = evidence.find((candidate) => candidate.id === ref)!;
    return {
      text: `↗ #${refNumber}${source.id.startsWith("x:") ? " · X（Grok 整理）" : ""}`,
      url: source.url,
    };
  });
  return {
    shape: "numbered",
    number,
    headline: item.headline,
    links,
    notes: [],
  };
}
