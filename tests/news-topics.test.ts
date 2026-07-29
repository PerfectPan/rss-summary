import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseNewsTopics } from "../src/news-topics.js";

describe("news topics", () => {
  it("loads the tracked technology and politics search topics", () => {
    const topics = parseNewsTopics(readFileSync(new URL("../news-topics.json", import.meta.url), "utf8"));

    expect(topics.map(({ id }) => id)).toEqual(["technology", "politics"]);
    expect(topics[0]).toMatchObject({
      enabled: true,
      label: "科技新闻",
      sourcePolicy: "authoritative",
    });
    expect(topics[1]).toMatchObject({
      enabled: true,
      label: "政治新闻",
      sourcePolicy: "official",
    });
    expect(topics.flatMap(({ queries }) => queries)).toHaveLength(6);
  });

  it("rejects duplicate topic ids and empty queries", () => {
    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          { id: "technology", label: "科技", enabled: true, sourcePolicy: "authoritative", maxItems: 3, queries: ["AI"] },
          { id: "technology", label: "重复", enabled: true, sourcePolicy: "official", maxItems: 3, queries: ["政策"] },
        ]),
      ),
    ).toThrow(/duplicate.*technology/i);

    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          { id: "technology", label: "科技", enabled: true, sourcePolicy: "authoritative", maxItems: 3, queries: [""] },
        ]),
      ),
    ).toThrow(/query/i);
  });

  it("bounds custom topic policies before they can fan out paid searches", () => {
    const queries = Array.from({ length: 9 }, (_, index) => `query-${index + 1}`);
    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          { id: "technology", label: "科技", enabled: true, sourcePolicy: "authoritative", maxItems: 3, queries },
        ]),
      ),
    ).toThrow(/at most 8 queries/i);

    expect(() =>
      parseNewsTopics(
        JSON.stringify([
          { id: "technology", label: "科技", enabled: true, sourcePolicy: "authoritative", maxItems: 11, queries: ["AI"] },
        ]),
      ),
    ).toThrow(/maxItems.*10/i);
  });
});
