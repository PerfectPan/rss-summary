import type { ViewDocument, ViewItem } from "./view.js";

type AutomationPresentationSource = {
  label: string;
  url: string;
};

type AutomationPresentationItem = {
  headline: string;
  note?: string;
  sources: AutomationPresentationSource[];
};

export type RssAutomationPresentationKind =
  | "daily-ai"
  | "generic"
  | "industry"
  | "news"
  | "subscriptions";

export type RssAutomationPresentation = {
  footnote?: string;
  kind: RssAutomationPresentationKind;
  meta: string[];
  schemaVersion: 1;
  sections: Array<{
    id: string;
    items: AutomationPresentationItem[];
    title: string;
  }>;
  summary?: string;
  title: string;
};

/**
 * Project a View IR document into the channel-neutral Automation Presentation
 * contract understood by modern Rivus renderers. The plugin owns headings,
 * items, notes, and sources; the Host only decides how those semantics look
 * in each channel. Bounds, section ids, and source labels reproduce the
 * values the legacy Markdown parser produced, locked by the differential
 * tests in tests/oracle/render/.
 */
export function renderAutomationPresentation(
  view: ViewDocument,
  kind: RssAutomationPresentationKind = "generic",
): RssAutomationPresentation {
  const meta = view.meta.map((line) => bounded(line, 80));
  const items = view.sections.map((section) => section.items.map((item) => presentItem(item)));
  const sections = view.sections.map((section, index) => {
    const heading = normalizeSectionTitle(section.heading);
    return {
      id: sectionId(heading, section.idIndex ?? index),
      items: items[index]!,
      title: bounded(heading, 80),
    };
  });
  const lastItem = items.flat().at(-1);
  const footnote = replayTrailing(view.trailing, meta, lastItem);
  return {
    ...(footnote === undefined ? {} : { footnote }),
    kind,
    meta,
    schemaVersion: 1,
    sections: sections.filter((section) => section.items.length > 0),
    title: bounded(view.title, 120),
  };
}

/**
 * Legacy routing for document-level trailing lines: `数据源状态` becomes the
 * footnote and resets the active item, plain notices join the last item's
 * note when one exists and otherwise land in meta (capped, then footnote).
 */
function replayTrailing(
  trailing: ViewDocument["trailing"],
  meta: string[],
  lastItem: AutomationPresentationItem | undefined,
): string | undefined {
  let footnote: string | undefined;
  let active = lastItem;
  for (const entry of trailing) {
    if (entry.kind === "status") {
      footnote = bounded(entry.text, 240);
      active = undefined;
      continue;
    }
    if (active) {
      active.note = bounded(active.note ? `${active.note} · ${entry.text}` : entry.text, 400);
      continue;
    }
    if (meta.length < 6) meta.push(bounded(entry.text, 80));
    else if (footnote === undefined) footnote = bounded(entry.text, 240);
  }
  return footnote;
}

function presentItem(item: ViewItem): AutomationPresentationItem {
  // The legacy parser deduped sources when the item was created and only then
  // let a `来源：` line relabel the last survivor, so keep that order.
  const sources = compactSources(baseSources(item));
  if (item.sourceLabel !== undefined && sources.length > 0) {
    sources.at(-1)!.label = bounded(item.sourceLabel, 60);
  }
  const notes = item.notes.filter((line) => line.trim().length > 0);
  const headline =
    item.shape === "featured" || item.shape === "card"
      ? bounded(item.headline, 240)
      : bounded(collapseListItemHeadline(item.headline), 240);
  return {
    headline,
    ...(notes.length > 0 ? { note: bounded(notes.join(" · "), 400) } : {}),
    sources,
  };
}

function baseSources(item: ViewItem): AutomationPresentationSource[] {
  const primary = item.links[0];
  if (item.shape === "featured" || item.shape === "card") {
    return primary ? [{ label: sourceLabel(primary.url), url: primary.url }] : [];
  }
  return item.links.map((link) => ({
    label: linkTextSourceLabel(link.text, link.url),
    url: link.url,
  }));
}

/** Strip the badge arrow the way the legacy parser normalized link labels. */
function linkTextSourceLabel(text: string, url: string): string {
  const normalized = text.replace(/\s*↗(?:\s*#\d+)?$/u, "").trim();
  if (!normalized || /^#\d+$/u.test(normalized)) return sourceLabel(url);
  return bounded(normalized, 60);
}

function collapseListItemHeadline(value: string): string {
  return value
    .replace(/^\*\*(.+)\*\*$/u, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactSources(sources: AutomationPresentationSource[]): AutomationPresentationSource[] {
  const labels = new Set<string>();
  return sources.filter((source) => {
    const key = source.label.toLocaleLowerCase("en-US");
    if (labels.has(key)) return false;
    labels.add(key);
    return true;
  });
}

function normalizeSectionTitle(value: string): string {
  const normalized = value
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s*·\s*\d+$/u, "")
    .trim();
  return normalized === "概览/要闻" ? "要闻" : normalized;
}

function sectionId(title: string, index: number): string {
  const known: Record<string, string> = {
    "AI 与 Agent": "ai-agent",
    产品应用: "products",
    其他更新: "other-updates",
    值得展开: "featured",
    动态速览: "briefs",
    开发生态: "developer-ecosystem",
    技术与洞察: "insights",
    模型发布: "models",
    行业动态: "industry",
    要闻: "top-stories",
    重点摘要: "featured",
  };
  return `${index + 1}-${known[title] ?? "section"}`;
}

function sourceLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./u, "");
    if (hostname === "github.com") return "GitHub";
    if (hostname === "github.blog") return "GitHub Blog";
    return bounded(hostname, 60);
  } catch {
    return "来源";
  }
}

function bounded(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return "未命名";
  return normalized.slice(0, maximum);
}
