import { describe, expect, it, vi } from "vite-plus/test";

import { normalizeEvent } from "../../src/acquisition/domain/item/adapters/github-event.js";
import { normalizeHomeCardSnapshot } from "../../src/acquisition/domain/item/adapters/github-home.js";
import { parseFeedXml } from "../../src/acquisition/domain/item/adapters/rss.js";
import {
  extractWebPageEntries,
  normalizeWebPageEntry,
} from "../../src/acquisition/domain/item/adapters/web-page.js";
import { normalizeEvent as legacyNormalizeEvent } from "./legacy-normalize-event.js";
import { normalizeHomeCardSnapshot as legacyHome } from "./legacy-github-home.js";
import { parseFeedXml as legacyParseFeedXml } from "./legacy-rss.js";
import {
  extractWebPageEntries as legacyExtract,
  normalizeWebPageEntry as legacyWebCard,
} from "./legacy-web-page.js";

const feed = { name: "Example", url: "https://example.com/feed", tags: ["ai"] };
const xml = `<rss><channel><item><title>Note</title><link>https://example.com/note</link><description>Body</description></item></channel></rss>`;

describe("activity card parity", () => {
  it("matches the legacy adapters on the same inputs", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    try {
      const cards = parseFeedXml(xml, feed, new Date());
      const legacyCards = legacyParseFeedXml(xml, feed);
      expect(cards).toEqual(legacyCards);
      expect(JSON.stringify(cards)).toBe(JSON.stringify(legacyCards));
      const event = {
        id: "1",
        type: "WatchEvent",
        actor: { login: "ada" },
        repo: { name: "acme/kit" },
        created_at: "2026-01-01T00:00:00Z",
      };
      expect(normalizeEvent(event)).toEqual(legacyNormalizeEvent(event));
      expect(JSON.stringify(normalizeEvent(event))).toBe(
        JSON.stringify(legacyNormalizeEvent(event)),
      );
      const snapshot = {
        id: "feed-item-1",
        card: { card_type: "STARRED_REPOSITORY", created_at: "2026-06-27T00:00:00Z" },
        text: "ada starred acme/kit",
        links: [
          { text: "ada", href: "https://github.com/ada" },
          { text: "acme/kit", href: "https://github.com/acme/kit" },
        ],
      };
      expect(normalizeHomeCardSnapshot(snapshot)).toEqual(legacyHome(snapshot));
      expect(JSON.stringify(normalizeHomeCardSnapshot(snapshot))).toBe(
        JSON.stringify(legacyHome(snapshot)),
      );
      const source = {
        type: "page" as const,
        name: "Example News",
        url: "https://example.com/news",
        pathPrefixes: ["/news/"],
        tags: ["AI"],
      };
      const html = `<a href="/news/one"><time datetime="2026-08-12">Aug 12, 2026</time>One</a>`;
      const entries = extractWebPageEntries(html, source);
      expect(entries).toEqual(legacyExtract(html, source));
      const webCards = entries.map((entry) => normalizeWebPageEntry(entry, source));
      const legacyWebCards = entries.map((entry) => legacyWebCard(entry, source));
      expect(webCards).toEqual(legacyWebCards);
      expect(JSON.stringify(webCards)).toBe(JSON.stringify(legacyWebCards));
    } finally {
      vi.useRealTimers();
    }
  });
});
