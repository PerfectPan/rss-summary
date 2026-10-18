import { describe, expect, it } from "vite-plus/test";

import { resolveNewsCredibility } from "./news-credibility.js";

const url = "https://news.example.com/story";

describe("news credibility", () => {
  it("maps certificate 1 and 2 onto official and authoritative tiers", () => {
    expect(resolveNewsCredibility({ url, authInfoLevel: 1 })).toEqual({
      tier: "official",
      rank: 1,
    });
    expect(resolveNewsCredibility({ url, authInfoLevel: 2 })).toEqual({
      tier: "authoritative",
      rank: 2,
    });
  });

  it("keeps every other certificate unrated, including a missing one", () => {
    expect(resolveNewsCredibility({ url, authInfoLevel: 3 })).toEqual({ tier: "unrated", rank: 3 });
    expect(resolveNewsCredibility({ url, authInfoLevel: 4 })).toEqual({ tier: "unrated", rank: 4 });
    expect(resolveNewsCredibility({ url })).toEqual({ tier: "unrated", rank: 4 });
  });

  it("maps an authority score onto the tiers without ever reaching official", () => {
    expect(resolveNewsCredibility({ url, authority: 3 })).toEqual({
      tier: "authoritative",
      rank: 2,
    });
    expect(resolveNewsCredibility({ url, authority: 2 })).toEqual({ tier: "unrated", rank: 4 });
    expect(resolveNewsCredibility({ url, authority: 4, authInfoLevel: 1 })).toEqual({
      tier: "authoritative",
      rank: 2,
    });
  });

  it("maps a configured domain and an article read without reading them in editorial", () => {
    expect(
      resolveNewsCredibility({
        url,
        sourceVerification: {
          method: "configured-domain",
          domain: "example.com",
          policy: "official",
        },
      }),
    ).toEqual({ tier: "official", method: "configured-domain", rank: 1 });
    expect(
      resolveNewsCredibility({
        url,
        sourceVerification: { method: "configured-domain", domain: "example.com", policy: "news" },
      }),
    ).toEqual({ tier: "authoritative", method: "configured-domain", rank: 2 });
    expect(
      resolveNewsCredibility({
        url,
        sourceVerification: { method: "article-read", domain: "example.com", policy: "official" },
      }),
    ).toEqual({ tier: "unrated", method: "article-read", rank: 4 });
    expect(
      resolveNewsCredibility({
        url: "https://other.test/story",
        sourceVerification: {
          method: "configured-domain",
          domain: "example.com",
          policy: "official",
        },
      }),
    ).toEqual({ tier: "unrated", method: "configured-domain", rank: 4 });
    expect(
      resolveNewsCredibility({
        url: "not-a-url",
        sourceVerification: { method: "configured-domain", domain: "example.com", policy: "news" },
      }),
    ).toEqual({ tier: "unrated", method: "configured-domain", rank: 4 });
  });
});
