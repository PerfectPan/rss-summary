import { describe, expect, it } from "vite-plus/test";

import { acquireHomeCard } from "../../../../../src/acquisition/domain/item/adapters/github-home.js";

describe("github home adapter", () => {
  it("maps a trending card onto the trending signal", () => {
    const acquired = acquireHomeCard({
      id: "feed-item-0",
      card: { card_type: "TRENDING_REPOSITORY", created_at: "2026-06-27T04:08:52.000-07:00" },
      text: "Trending repositories simplex-chat/simplex-chat",
      links: [
        { text: "simplex-chat/simplex-chat", href: "https://github.com/simplex-chat/simplex-chat" },
      ],
    });
    expect(acquired.card).toMatchObject({
      type: "trending",
      source: "github",
      actor: "GitHub Home",
      repo: "simplex-chat/simplex-chat",
      action: "trending",
    });
    expect(acquired.item.signals).toEqual([
      { type: "recommended-trending", label: "GitHub Home trending repository" },
    ]);
  });

  it("maps recommendation, announcement, and follow cards", () => {
    expect(
      acquireHomeCard({
        id: "r",
        card: { card_type: "REPOSITORY_RECOMMENDATION", created_at: "2026-06-26T00:00:00Z" },
        text: "onnx/onnx",
        links: [{ text: "onnx/onnx", href: "https://github.com/onnx/onnx" }],
      }).item.signals[0]?.type,
    ).toBe("recommended-personal");
    expect(
      acquireHomeCard({
        id: "a",
        card: { card_type: "ANNOUNCEMENT", created_at: "2026-06-26T00:00:00Z" },
        text: "A note",
        links: [],
      }).item,
    ).toMatchObject({
      kind: "post",
      signals: [{ type: "announced", label: "GitHub Home announcement" }],
    });
    expect(
      acquireHomeCard({
        id: "f",
        card: { card_type: "FOLLOWED_USER", created_at: "2026-06-26T00:00:00Z" },
        text: "followed",
        links: [{ text: "ada", href: "https://github.com/ada" }],
      }).item.signals[0],
    ).toEqual({ type: "relationship", label: "follow relationship from GitHub Home" });
  });
});
