import type { Item } from "../../../acquisition/index.js";

import { publicUrl } from "../public-url.js";
import { glmResultList, text } from "./dto.js";

export type ResearchSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type GlmSearchAcquired = {
  results: ResearchSearchResult[];
  items: Item[];
  rawResults: number;
  domainRejected: number;
};

export function parseGlmSearchResults(
  value: unknown,
  allowed: readonly string[],
): GlmSearchAcquired {
  const records = glmResultList(value);
  const results: ResearchSearchResult[] = [];
  const items: Item[] = [];
  let domainRejected = 0;
  const seen = new Set<string>();
  for (const record of records) {
    if (
      typeof record.title !== "string" ||
      typeof record.link !== "string" ||
      !record.title.trim()
    ) {
      continue;
    }
    let url: URL;
    try {
      url = publicUrl(record.link);
    } catch {
      continue;
    }
    if (
      allowed.length > 0 &&
      !allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    ) {
      domainRejected++;
      continue;
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const result: ResearchSearchResult = {
      title: record.title.slice(0, 500),
      url: url.href,
      snippet: text(record.content).slice(0, 3000),
    };
    results.push(result);
    items.push(itemFromGlm(result, results.length));
    if (results.length === 10) break;
  }
  return { results, items, rawResults: records.length, domainRejected };
}

function itemFromGlm(result: ResearchSearchResult, rankPosition: number): Item {
  let name = result.url;
  try {
    name = new URL(result.url).hostname;
  } catch {
    name = result.url;
  }
  return {
    id: `glm:${result.url}`,
    kind: "publication",
    subject: { key: result.url, name, url: result.url },
    content: { title: result.title, excerpt: result.snippet, url: result.url },
    publishedAt: { value: "", precision: "date" },
    provenance: { origin: result.url },
    credibility: { tier: "unrated" },
    signals: [],
    rank: { position: rankPosition },
    display: { label: name, reference: result.url, facts: [] },
  };
}
