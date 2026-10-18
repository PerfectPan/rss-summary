import type { ViewDocument, ViewItem, ViewLink, ViewSection } from "./view.js";

/**
 * Recover a View IR from canonical rss-summary Markdown. This is the
 * compatibility path for Automation replies the plugin did not render itself
 * (an Agent that altered the Tool's Markdown, or synthetic text): the line
 * grammar is exactly the one app/render/markdown.ts emits, and the routing
 * rules reproduce the earlier Markdown parser, so a decoded view presents
 * identically to it (locked by the golden registration snapshot and
 * view-decode.test.ts).
 */
export function decodeViewFromMarkdown(markdown: string): ViewDocument {
  const lines = markdown
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim());
  const headingIndex = lines.findIndex((line) => /^#{1,6}\s+/u.test(line));
  const meta: string[] = [];
  const sections: ViewSection[] = [];
  let current: ViewSection | undefined;
  let activeItem: ViewItem | undefined;
  let footnote: string | undefined;

  const ensureSection = (): ViewSection => {
    if (current) return current;
    current = { heading: "动态", style: "strong", items: [], idIndex: sections.length };
    sections.push(current);
    return current;
  };

  for (const [index, line] of lines.entries()) {
    if (index <= headingIndex || !line) continue;
    if (/^数据源状态[：:]/u.test(line)) {
      footnote = line;
      activeItem = undefined;
      continue;
    }
    if (/^来源[：:]/u.test(line)) {
      if (activeItem) activeItem.sourceLabel = line.replace(/^来源[：:]/u, "");
      continue;
    }
    const sectionTitle = readSectionTitle(line);
    if (sectionTitle) {
      current = {
        heading: sectionTitle.text,
        style: sectionTitle.style,
        items: [],
        idIndex: sections.length,
      };
      sections.push(current);
      activeItem = undefined;
      continue;
    }
    const newsItem = /^\*\*(\d+)\.\s+\[(.+?)\]\((https?:\/\/[^)]+)\)\*\*$/u.exec(line);
    if (newsItem) {
      activeItem = {
        shape: "card",
        number: Number(newsItem[1]),
        headline: newsItem[2]!,
        links: [{ text: newsItem[2]!, url: newsItem[3]! }],
        notes: [],
      };
      ensureSection().items.push(activeItem);
      continue;
    }
    const featured = /^\*\*\[(.+?)\]\((https?:\/\/[^)]+)\)\*\*$/u.exec(line);
    if (featured) {
      activeItem = {
        shape: "featured",
        headline: featured[1]!,
        links: [{ text: featured[1]!, url: featured[2]! }],
        notes: [],
      };
      ensureSection().items.push(activeItem);
      continue;
    }
    const listItem = /^(?:(\d+)\.|-)\s+(.+)$/u.exec(line);
    if (listItem) {
      activeItem = parseListItem(listItem[1] ? Number(listItem[1]) : undefined, listItem[2]!);
      ensureSection().items.push(activeItem);
      continue;
    }
    if (!current && meta.length < 6) {
      meta.push(line);
      continue;
    }
    if (activeItem) {
      activeItem.notes.push(line.replace(/^来源[：:]\s*/u, ""));
      continue;
    }
    if (footnote === undefined) footnote = line;
  }

  return {
    title: (lines[headingIndex] ?? "Rivus 自动简报").replace(/^#{1,6}\s+/u, ""),
    meta,
    sections: sections.filter((section) => section.items.length > 0),
    trailing: footnote === undefined ? [] : [{ kind: "status", text: footnote }],
    variant: "brief",
  };
}

function readSectionTitle(line: string): { text: string; style: "strong" | "atx" } | undefined {
  const markdownHeading = /^#{2,6}\s+(.+)$/u.exec(line)?.[1];
  if (markdownHeading) return { text: markdownHeading, style: "atx" };
  const strong = /^\*\*([^*]+)\*\*$/u.exec(line)?.[1];
  return strong && !/^\d+\./u.test(strong) && !strong.startsWith("[")
    ? { text: strong, style: "strong" }
    : undefined;
}

function parseListItem(number: number | undefined, value: string): ViewItem {
  const emphasizedLink = /^\*\*\[(.+?)\]\((https?:\/\/[^)]+)\)\*\*$/u.exec(value.trim());
  if (emphasizedLink) {
    return {
      shape: "card",
      headline: emphasizedLink[1]!,
      links: [{ text: emphasizedLink[1]!, url: emphasizedLink[2]! }],
      notes: [],
    };
  }
  const links: ViewLink[] = [];
  const headline = value
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/gu, (_match, text: string, url: string) => {
      links.push({ text, url });
      return "";
    })
    .replace(/^\*\*(.+)\*\*$/u, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  return {
    shape: number === undefined ? "bullet" : "numbered",
    ...(number === undefined ? {} : { number }),
    headline,
    links,
    notes: [],
  };
}
