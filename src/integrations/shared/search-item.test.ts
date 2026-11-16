import { describe, expect, it } from "vite-plus/test";

import type { SearchResult } from "../../acquisition/index.js";
import { itemFromPublication, itemFromSearchResult } from "./search-item.js";

const result: SearchResult = {
  id: "r1",
  title: "A release",
  siteName: "example.com",
  url: "https://example.com/a",
  snippet: "snippet text",
  summary: "summary text",
  publishTime: "2026-01-02",
  rankPosition: 3,
  rankScore: 0.4
};

describe("search item", () => {
  it("prefers the summary over the snippet for the publication excerpt", () => {
    const excerptOf = (r: SearchResult): string | undefined =>
      itemFromPublication(r, {
        publishedAt: { value: "", precision: "date" },
        provenance: { origin: r.url },
        credibility: { tier: "unrated" }
      }).content.excerpt;
    expect(excerptOf(result)).toBe("summary text");
    expect(excerptOf({ ...result, summary: undefined })).toBe("snippet text");
    expect(excerptOf({ ...result, summary: undefined, snippet: undefined })).toBeUndefined();
  });

  it("maps a provider result into the shared Item shape", () => {
    const item = itemFromSearchResult(result, {
      kind: "post",
      excerpt: "chosen",
      publishedAt: { value: "2026-01-02", precision: "instant" },
      provenance: { origin: result.url, note: "badge" },
      credibility: { tier: "unrated" },
      rankScore: result.rankScore
    });
    expect(item).toMatchObject({
      id: "r1",
      kind: "post",
      subject: { key: result.url, name: "example.com", url: result.url },
      content: { title: "A release", excerpt: "chosen", url: result.url },
      provenance: { origin: result.url, note: "badge" },
      credibility: { tier: "unrated" },
      rank: { position: 3, score: 0.4 },
      display: { label: "example.com", reference: result.url, facts: [] }
    });
  });

  it("omits the excerpt, the rank score and the label when the result carries none", () => {
    const bare: SearchResult = { id: "r2", title: "t", url: "https://example.com/b", rankPosition: 1 };
    const item = itemFromSearchResult(bare, {
      kind: "publication",
      publishedAt: { value: "", precision: "date" },
      provenance: { origin: bare.url },
      credibility: { tier: "unrated" }
    });
    expect(item.content).not.toHaveProperty("excerpt");
    expect(item.rank).toEqual({ position: 1 });
    expect(item.display).toEqual({ reference: bare.url, facts: [] });
  });

  it("maps publications through the excerpt helper", () => {
    const item = itemFromPublication(result, {
      publishedAt: { value: "2026-01-02", precision: "date" },
      provenance: { origin: result.url },
      credibility: { tier: "authoritative" },
      rankScore: result.rankScore
    });
    expect(item.kind).toBe("publication");
    expect(item.content.excerpt).toBe("summary text");
    expect(item.credibility).toEqual({ tier: "authoritative" });
  });
});
