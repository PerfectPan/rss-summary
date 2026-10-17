import type { Item } from "../item.js";

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

export function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("A public HTTP(S) URL is required.");
  }
  const host = url.hostname;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host.includes(":") ||
    /^[\d.]+$/u.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/iu.test(host)
  ) {
    throw new Error("A public HTTP(S) URL without credentials is required.");
  }
  return url;
}

export function allowedSearchDomains(domains: readonly string[]): string[] {
  return domains.map((domain) => {
    const url = publicUrl(`https://${domain}`);
    if (url.host !== domain.toLowerCase() || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Source domains must be hostnames without paths or ports.");
    }
    return url.hostname;
  });
}

export function parseGlmSearchResults(
  value: unknown,
  allowed: readonly string[],
): GlmSearchAcquired {
  if (!Array.isArray(value)) throw new Error("GLM search returned an invalid result list.");
  const results: ResearchSearchResult[] = [];
  const items: Item[] = [];
  let domainRejected = 0;
  const seen = new Set<string>();
  for (const item of value) {
    const record = asRecord(item);
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
  return { results, items, rawResults: value.length, domainRejected };
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
