import { describe, expect, it } from "vite-plus/test";

import { parseSignalSources } from "../../src/infrastructure/signal-sources.js";

const minimalConfig = {
  timezoneOffsetEnv: "FEED_TIMEZONE_OFFSET",
  quotas: { maxTotal: 8, updates: 5, opensource: 4 },
  frontendBias: {
    languages: ["TypeScript"],
    repoTopics: ["react", "mcp"],
    updateKeywords: ["agent"],
    modelTitleHints: ["GPT", "Claude"],
  },
  scoring: { officialDomainBoost: 30, frontendKeywordBoost: 8 },
  hackerNews: { minPoints: 80, includeShowHn: true, maxItems: 20 },
  githubSearch: {
    createdWithinDays: 7,
    minStars: 50,
    languages: ["TypeScript"],
    topics: ["ai"],
    excludeNamePatterns: ["^awesome[-_]"],
    perPage: 8,
  },
  officialSearch: {
    domains: ["openai.com"],
    intents: [
      { kind: "model", query: "model release" },
      { kind: "product", query: "product launch" },
    ],
    countPerQuery: 10,
  },
};

describe("signal sources configuration", () => {
  it("parses a complete configuration with defaults for missing values", () => {
    const config = parseSignalSources(JSON.stringify(minimalConfig));

    expect(config.timezoneOffsetEnv).toBe("FEED_TIMEZONE_OFFSET");
    expect(config.quotas).toEqual({ maxTotal: 8, updates: 5, opensource: 4 });
    expect(config.scoring).toMatchObject({ officialDomainBoost: 30, frontendKeywordBoost: 8 });
    expect(config.scoring.hnPointsMaxScore).toBe(30);
    expect(config.githubSearch.excludeNamePatterns[0]?.source).toBe("^awesome[-_]");
  });

  it("defaults missing optional fields", () => {
    const config = parseSignalSources(JSON.stringify({ ...minimalConfig, quotas: {} }));

    expect(config.quotas).toEqual({ maxTotal: 8, updates: 5, opensource: 4 });
    expect(config.officialSearch.countPerQuery).toBe(10);
    expect(config.hackerNews.minPoints).toBe(80);
    expect(config.githubSearch.createdWithinDays).toBe(7);
  });

  it("rejects per-section quotas above the global cap", () => {
    expect(() =>
      parseSignalSources(
        JSON.stringify({ ...minimalConfig, quotas: { maxTotal: 5, updates: 6, opensource: 4 } }),
      ),
    ).toThrow(/must not exceed/);
  });

  it("requires both model and product official-search intents", () => {
    expect(() =>
      parseSignalSources(
        JSON.stringify({
          ...minimalConfig,
          officialSearch: {
            ...minimalConfig.officialSearch,
            intents: [{ kind: "model", query: "x" }],
          },
        }),
      ),
    ).toThrow(/one model and one product/);
  });

  it("rejects out-of-range numeric values and bad regex patterns", () => {
    expect(() =>
      parseSignalSources(JSON.stringify({ ...minimalConfig, quotas: { maxTotal: 99 } })),
    ).toThrow(/between/);
    expect(() =>
      parseSignalSources(
        JSON.stringify({
          ...minimalConfig,
          githubSearch: { ...minimalConfig.githubSearch, excludeNamePatterns: ["["] },
        }),
      ),
    ).toThrow(/not a valid regular expression/);
  });
});
