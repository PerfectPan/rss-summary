import { describe, expect, it } from "vite-plus/test";

import {
  publicationAcquired,
  type ActivityCardDto,
} from "../../../../../src/acquisition/domain/item/adapters/activity-card.js";

const card: ActivityCardDto = {
  id: "rss:https://deno.com/feed:deno-2.4",
  type: "article",
  source: "rss",
  actor: "Deno Blog",
  repo: "rss:https://deno.com/blog/v2.4",
  createdAt: "2026-06-22T08:00:00.000Z",
  action: "published",
  htmlUrl: "https://deno.com/blog/v2.4",
  title: "Deno 2.4",
  summary: "A release note",
  sourceName: "Deno Blog",
  sourceUrl: "https://deno.com/feed",
  tags: ["releases"],
};

describe("publication items", () => {
  it("keeps the activity card and classifies the publication beside it", () => {
    const acquired = publicationAcquired(card);
    expect(acquired.card).toBe(card);
    expect(acquired.item.kind).toBe("publication");
    expect(acquired.item.subject.key).toBe("publication:https://deno.com/blog/v2.4");
    expect(acquired.item.signals).toEqual([{ type: "article", label: "rss feed: Deno Blog" }]);
    expect(acquired.item.display.facts).toEqual(["releases"]);
  });

  it("uses the website and research labels for those publication kinds", () => {
    expect(publicationAcquired({ ...card, type: "paper", source: "web" }).item.signals).toEqual([
      { type: "paper", label: "research paper: Deno Blog" },
    ]);
    expect(publicationAcquired({ ...card, type: "paper", source: "web" }).item.kind).toBe("paper");
    expect(publicationAcquired({ ...card, type: "release" }).item.signals).toEqual([
      { type: "release", label: "new release published" },
    ]);
    expect(
      publicationAcquired({ ...card, source: "web", sourceName: "Example News" }).item.signals[0]
        ?.label,
    ).toBe("website source: Example News");
  });
});
