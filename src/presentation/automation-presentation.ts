type AutomationPresentationSource = {
  label: string;
  url: string;
};

type AutomationPresentationItem = {
  headline: string;
  note?: string;
  sources: AutomationPresentationSource[];
};

export type RssAutomationPresentation = {
  footnote?: string;
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
 * Convert rss-summary's canonical Markdown into the channel-neutral Automation
 * Presentation contract understood by modern Rivus renderers. Keeping this
 * adapter in the Plugin preserves ownership of headings, items, notes, and
 * sources; the Host only decides how those semantics look in each channel.
 */
export function createRssAutomationPresentation(markdown: string): RssAutomationPresentation {
  const lines = markdown
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim());
  const headingIndex = lines.findIndex((line) => /^#{1,6}\s+/u.test(line));
  const title = bounded((lines[headingIndex] ?? "Rivus 自动简报").replace(/^#{1,6}\s+/u, ""), 120);
  const meta: string[] = [];
  const sections: RssAutomationPresentation["sections"] = [];
  let current: RssAutomationPresentation["sections"][number] | undefined;
  let activeItem: AutomationPresentationItem | undefined;
  let footnote: string | undefined;

  const ensureSection = (fallback = "动态"): RssAutomationPresentation["sections"][number] => {
    if (current) return current;
    current = { id: sectionId(fallback, sections.length), items: [], title: bounded(fallback, 80) };
    sections.push(current);
    return current;
  };
  const addItem = (headline: string, sources: AutomationPresentationSource[]): void => {
    activeItem = { headline: bounded(headline, 240), sources };
    ensureSection().items.push(activeItem);
  };

  for (const [index, line] of lines.entries()) {
    if (index <= headingIndex || !line) continue;
    if (/^数据源状态[：:]/u.test(line)) {
      footnote = bounded(line, 240);
      activeItem = undefined;
      continue;
    }
    const sectionTitle = readSectionTitle(line);
    if (sectionTitle) {
      const normalizedTitle = normalizeSectionTitle(sectionTitle);
      current = {
        id: sectionId(normalizedTitle, sections.length),
        items: [],
        title: bounded(normalizedTitle, 80),
      };
      sections.push(current);
      activeItem = undefined;
      continue;
    }
    const newsItem = /^\*\*(\d+)\.\s+\[(.+?)\]\((https?:\/\/[^)]+)\)\*\*$/u.exec(line);
    if (newsItem) {
      addItem(newsItem[2]!, [{ label: sourceLabel(newsItem[3]!), url: newsItem[3]! }]);
      continue;
    }
    const featured = /^\*\*\[(.+?)\]\((https?:\/\/[^)]+)\)\*\*$/u.exec(line);
    if (featured) {
      addItem(featured[1]!, [{ label: sourceLabel(featured[2]!), url: featured[2]! }]);
      continue;
    }
    const listItem = /^(?:\d+\.|-)\s+(.+)$/u.exec(line);
    if (listItem) {
      const parsed = parseInlineSources(listItem[1]!);
      addItem(parsed.headline, parsed.sources);
      continue;
    }
    if (!current && meta.length < 6) {
      meta.push(bounded(line, 80));
      continue;
    }
    if (activeItem) {
      const note = line.replace(/^来源[：:]\s*/u, "");
      activeItem.note = bounded(activeItem.note ? `${activeItem.note} · ${note}` : note, 400);
      continue;
    }
    if (!footnote) footnote = bounded(line, 240);
  }

  return {
    ...(footnote ? { footnote } : {}),
    meta,
    schemaVersion: 1,
    sections: sections.filter((section) => section.items.length > 0),
    title,
  };
}

function readSectionTitle(line: string): string | undefined {
  const markdownHeading = /^#{2,6}\s+(.+)$/u.exec(line)?.[1];
  if (markdownHeading) return markdownHeading;
  const strong = /^\*\*([^*]+)\*\*$/u.exec(line)?.[1];
  return strong && !/^\d+\./u.test(strong) && !strong.startsWith("[") ? strong : undefined;
}

function normalizeSectionTitle(value: string): string {
  const normalized = value
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s*·\s*\d+$/u, "")
    .trim();
  return normalized === "概览/要闻" ? "要闻" : normalized;
}

function parseInlineSources(value: string): {
  headline: string;
  sources: AutomationPresentationSource[];
} {
  const sources: AutomationPresentationSource[] = [];
  const headline = value
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/gu, (_match, label: string, url: string) => {
      sources.push({
        label: /^↗\s*#\d+$/u.test(label) ? sourceLabel(url) : bounded(label, 60),
        url,
      });
      return "";
    })
    .replace(/\s+/gu, " ")
    .trim();
  return { headline, sources };
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
    return bounded(new URL(url).hostname.replace(/^www\./u, ""), 60);
  } catch {
    return "来源";
  }
}

function bounded(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return "未命名";
  return normalized.slice(0, maximum);
}
