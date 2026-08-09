import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { parseNewsTopics } from "../../src/infrastructure/news-topics.js";

describe("news topics", () => {
  it("loads the curated daily brief topics within the eight-item and search budgets", () => {
    const topics = parseNewsTopics(
      readFileSync(new URL("../../news-topics.json", import.meta.url), "utf8"),
    );

    expect(topics.map(({ id }) => id)).toEqual([
      "ai-model-releases",
      "developer-tools",
      "infrastructure-security",
      "tech-policy",
      "capital-industry",
    ]);
    expect(topics.reduce((total, { maxItems }) => total + maxItems, 0)).toBe(8);
    const queries = topics.flatMap(({ queries }) => queries);
    expect(queries).toHaveLength(7);
    expect(queries.every((query) => query.includes("只要"))).toBe(true);
    expect(queries.join(" ")).not.toContain("产品 商业化 研发组织 小团队");
    expect(
      topics
        .filter(({ id }) => ["ai-model-releases", "developer-tools", "tech-policy"].includes(id))
        .every(({ sourcePolicy }) => sourcePolicy === "official"),
    ).toBe(true);
    expect(
      topics
        .filter(({ id }) => ["infrastructure-security", "capital-industry"].includes(id))
        .every(({ sourcePolicy }) => sourcePolicy === "authoritative"),
    ).toBe(true);
  });

  it("rejects duplicate topic ids and empty queries", () => {
    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          {
            id: "technology",
            label: "科技",
            enabled: true,
            sourcePolicy: "authoritative",
            maxItems: 3,
            queries: ["AI"],
          },
          {
            id: "technology",
            label: "重复",
            enabled: true,
            sourcePolicy: "official",
            maxItems: 3,
            queries: ["政策"],
          },
        ]),
      ),
    ).toThrow(/duplicate.*technology/i);

    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          {
            id: "technology",
            label: "科技",
            enabled: true,
            sourcePolicy: "authoritative",
            maxItems: 3,
            queries: [""],
          },
        ]),
      ),
    ).toThrow(/query/i);
  });

  it("bounds custom topic policies before they can fan out paid searches", () => {
    const queries = Array.from({ length: 9 }, (_, index) => `query-${index + 1}`);
    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          {
            id: "technology",
            label: "科技",
            enabled: true,
            sourcePolicy: "authoritative",
            maxItems: 3,
            queries,
          },
        ]),
      ),
    ).toThrow(/at most 8 queries/i);

    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          {
            id: "technology",
            label: "科技",
            enabled: true,
            sourcePolicy: "authoritative",
            maxItems: 11,
            queries: ["AI"],
          },
        ]),
      ),
    ).toThrow(/maxItems.*10/i);

    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          {
            id: "technology",
            label: "科技",
            enabled: true,
            sourcePolicy: "authoritative",
            maxItems: 3,
            queries: ["a".repeat(101)],
          },
        ]),
      ),
    ).toThrow(/query 1.*100 characters/i);
  });
});
