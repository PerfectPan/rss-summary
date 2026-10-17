import { expect, it } from "vite-plus/test";

import {
  credibilityForAuthLevel,
  parseDoubaoResponse,
  validateDoubaoInput,
} from "../../../../../src/acquisition/domain/item/adapters/doubao.js";

const input = {
  query: "release",
  count: 5,
  day: "2026-08-16",
  sourcePolicy: "news",
};

it("parses a result into a page and an item whose credibility follows the authority level", () => {
  const acquired = parseDoubaoResponse({
    Result: {
      LogId: "log-1",
      ResultCount: 1,
      TimeCost: 12,
      WebResults: [
        {
          Id: "1",
          Title: "Title",
          Url: "https://example.com/a",
          SortId: 1,
          SiteName: "Example",
          Summary: "Summary",
          AuthInfoLevel: 1,
          AuthInfoDes: "官方",
        },
        { Title: "missing id" },
      ],
    },
  });
  expect(acquired.page).toMatchObject({ logId: "log-1", resultCount: 1, timeCostMs: 12 });
  expect(acquired.page.results).toEqual([
    expect.objectContaining({ id: "1", title: "Title", authInfoLevel: 1, rankPosition: 1 }),
  ]);
  expect(acquired.items[0]).toMatchObject({
    id: "1",
    kind: "publication",
    credibility: { tier: "official" },
  });
  expect(credibilityForAuthLevel(2)).toEqual({ tier: "authoritative" });
  expect(credibilityForAuthLevel(4)).toEqual({ tier: "unrated" });
  expect(credibilityForAuthLevel(undefined)).toEqual({ tier: "unrated" });
});

it("keeps provider error codes and rejects an empty query", () => {
  expect(() =>
    parseDoubaoResponse({ ResponseMetadata: { Error: { Code: "10406", Message: "quota" } } }),
  ).toThrow("Doubao search API error 10406: quota");
  expect(() => validateDoubaoInput({ ...input, query: " " })).toThrow(
    "Doubao search query must contain 1 to 100 characters.",
  );
  expect(() => validateDoubaoInput({ ...input, sinceDay: "2026-08-17" })).toThrow(
    "Invalid search start date.",
  );
});
