import type { ActivityCard } from "../domain/digest.js";
import type { RunSourceResult } from "../domain/run-audit.js";
import type { IndustrySource, WebPageSubscription } from "./config.js";
import { errorMessage } from "./parsing.js";
import type { RssClient } from "./rss.js";
import type { WebPageClient } from "./web-page.js";

export type IndustrySourceCollection = {
  events: ActivityCard[];
  sources: RunSourceResult[];
};

type IndustrySourceClients = {
  rss: Pick<RssClient, "getFeedEvents">;
  page: Pick<WebPageClient, "getEvents">;
};

/** Collect first-party RSS and explicit listing pages with per-source failure isolation. */
export async function collectIndustrySources(
  clients: IndustrySourceClients,
  sources: IndustrySource[],
): Promise<IndustrySourceCollection> {
  const results = await Promise.all(
    sources.map(async (source) => {
      const kind: RunSourceResult["kind"] = isWebPageSource(source) ? "web-page" : "rss";
      try {
        const events = isWebPageSource(source)
          ? await clients.page.getEvents(source)
          : await clients.rss.getFeedEvents(source);
        return {
          events,
          source: {
            id: source.url,
            kind,
            name: source.name,
            url: source.url,
            status: "ok" as const,
            itemCount: events.length,
          },
        };
      } catch (error) {
        return {
          events: [],
          source: {
            id: source.url,
            kind,
            name: source.name,
            url: source.url,
            status: "failed" as const,
            itemCount: 0,
            error: errorMessage(error),
          },
        };
      }
    }),
  );

  return {
    events: results.flatMap((result) => result.events),
    sources: results.map((result) => result.source),
  };
}

function isWebPageSource(source: IndustrySource): source is WebPageSubscription {
  return "type" in source && source.type === "page";
}
