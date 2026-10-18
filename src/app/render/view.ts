/**
 * View IR: the structured document every product layout produces before any
 * channel-specific rendering happens. Markdown (`app/render/markdown.ts`) and
 * the Automation Presentation (`app/render/automation.ts`) both project this
 * type, so a new delivery channel only needs one more projection instead of
 * reverse-parsing an already rendered string.
 *
 * The IR is pure data. Field values carry the exact text a channel should
 * show (link texts are stored as they appear inside a Markdown link), while
 * layout concerns such as blank-line placement stay in the renderers.
 */

/** A hyperlink with the exact text rendered inside the Markdown link. */
export type ViewLink = {
  text: string;
  url: string;
};

/**
 * Item line shapes emitted by the product layouts. `featured` and `card`
 * render the headline as a bold link, `numbered` and `bullet` render it as a
 * plain list entry whose links are inline badges.
 */
export type ViewItemShape = "featured" | "card" | "numbered" | "bullet";

export type ViewItem = {
  shape: ViewItemShape;
  /** Displayed headline; for `featured`/`card` it equals `links[0].text`. */
  headline: string;
  /** Links attached to the item, in display order. */
  links: ViewLink[];
  /** Lines rendered below the headline line (facts, summary, byline). */
  notes: string[];
  /** Value of a `来源：` line; presentations relabel the last source with it. */
  sourceLabel?: string;
  /** Ordinal written before the headline; Markdown layout only. */
  number?: number;
};

export type ViewSection = {
  /** Heading text without the `**` or `##` decoration. */
  heading: string;
  style: "strong" | "atx";
  items: ViewItem[];
  /**
   * Position used when deriving presentation section ids. Only the Markdown
   * decoder sets it, to keep ids stable when earlier sections carry no items.
   */
  idIndex?: number;
};

/**
 * Document-level line emitted after all sections. `status` lines (数据源状态)
 * become the presentation footnote; `plain` lines (empty/pending notices,
 * 采集说明) follow the legacy parser's routing into meta or the last item's
 * note depending on whether any item precedes them.
 */
export type ViewTrailing = {
  kind: "plain" | "status";
  text: string;
};

/** Blank-line and terminator conventions inherited from the source renderers. */
export type ViewVariant = "brief" | "news" | "daily-ai";

export type ViewDocument = {
  /** Document title as written after the leading `#`. */
  title: string;
  /** Lines between the title and the first section. */
  meta: string[];
  sections: ViewSection[];
  trailing: ViewTrailing[];
  variant: ViewVariant;
};
