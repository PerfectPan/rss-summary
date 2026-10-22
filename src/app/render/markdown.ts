import { formatCompactCount } from "../../kernel/index.js";
import type { ViewDocument, ViewItem } from "./view.js";

export function markdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/gu, "\\$1");
}

export const formatStarCount = formatCompactCount;

export function displayTime(value: string | undefined): string | undefined {
  const match = /[T ](\d{2}:\d{2})/u.exec(value ?? "");
  return match?.[1];
}

/**
 * Render a View IR document back to the canonical Markdown every consumer
 * (CLI, run archive, Rivus Tool output) expects. Blank-line placement follows
 * the layout variant the product layout chose, so the output is byte-for-byte
 * the Markdown the per-product renderers produced before the View IR existed.
 */
export function renderViewMarkdown(view: ViewDocument): string {
  const lines: string[] = [`# ${view.title}`, "", ...view.meta, ""];
  for (const section of view.sections) {
    lines.push(section.style === "atx" ? `## ${section.heading}` : `**${section.heading}**`, "");
    for (const item of section.items) lines.push(...itemLines(item));
    const last = section.items.at(-1)?.shape;
    if (last === "bullet" || last === "numbered") lines.push("");
  }
  for (const entry of view.trailing) {
    if (view.variant === "brief") {
      lines.push(entry.text);
      continue;
    }
    if (view.variant === "daily-ai" && entry.kind === "status") lines.push("");
    lines.push(entry.text);
    if (view.variant !== "daily-ai" || entry.kind !== "status") lines.push("");
  }
  const joined = lines.join("\n").trim();
  return view.variant === "daily-ai" ? joined : `${joined}\n`;
}

function itemLines(item: ViewItem): string[] {
  const primary = item.links[0];
  if (item.shape === "featured") {
    return [
      `**[${item.headline}](${primary?.url ?? ""})**`,
      ...item.notes,
      ...(item.sourceLabel === undefined ? [] : [`来源：${item.sourceLabel}`]),
      "",
    ];
  }
  if (item.shape === "card") {
    return [`**${item.number}. [${item.headline}](${primary?.url ?? ""})**`, ...item.notes, ""];
  }
  const badges = item.links.map((link) => `[${link.text}](${link.url})`).join(" ");
  if (item.shape === "bullet") return [`- ${item.headline}${badges}`];
  return [`${item.number}. ${item.headline}${badges ? ` ${badges}` : ""}`];
}
