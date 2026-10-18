import {
  renderAutomationPresentation,
  type RssAutomationPresentation,
  type RssAutomationPresentationKind,
} from "./automation.js";
import { renderViewMarkdown } from "./markdown.js";
import { decodeViewFromMarkdown } from "./view-decode.js";
import type { ViewDocument } from "./view.js";

/**
 * Remembers the View IR behind the most recent delivered Markdown so Rivus
 * Automations can present the document they actually rendered instead of
 * re-parsing the Agent reply. Entries are keyed by the exact Markdown text
 * and evicted in insertion order, mirroring the Tool session caches.
 */
const delivered = new Map<string, ViewDocument>();
const CAPACITY = 8;

/** Render delivery Markdown and remember the view it projects. */
export function renderDeliveredMarkdown(view: ViewDocument): string {
  const markdown = renderViewMarkdown(view);
  delivered.set(markdown, view);
  while (delivered.size > CAPACITY) delivered.delete(delivered.keys().next().value!);
  return markdown;
}

/**
 * Present the Automation reply text. Text the plugin rendered itself resolves
 * to its remembered view; anything else (an Agent that altered the reply, or
 * synthetic text) falls back to decoding the canonical Markdown grammar.
 */
export function automationPresentationForText(
  text: string,
  kind: RssAutomationPresentationKind,
): RssAutomationPresentation {
  return renderAutomationPresentation(delivered.get(text) ?? decodeViewFromMarkdown(text), kind);
}

/** Test accessor for the remembered (Markdown, view) pairs. */
export function deliveredViews(): ReadonlyArray<{ markdown: string; view: ViewDocument }> {
  return [...delivered.entries()].map(([markdown, view]) => ({ markdown, view }));
}

/** Reset the remembered views; test isolation only. */
export function clearDeliveredViews(): void {
  delivered.clear();
}
