import { describe, expect, it } from "vitest";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GitHubHomeClient,
  extractHomeFeedSnapshotsFromHtml,
  normalizeHomeCardSnapshot,
  normalizeHomeCardSnapshots,
} from "../src/github-home.js";

describe("GitHub Home feed source", () => {
  it("normalizes a rendered Home merged pull request card", () => {
    const card = normalizeHomeCardSnapshot({
      id: "feed-item-11077785328",
      card: {
        card_type: "MERGED_PULL_REQUEST",
        created_at: "2026-06-27T21:51:24.000-07:00",
        card_position: 0,
        card_sub_position: null,
        resource_type: "PULL_REQUEST",
        gatherer: "pullrequest_for_you_feed_mysql",
      },
      text:
        "dai-shi contributed to wakujs/waku June 27, 2026 21:51 refactor: static etag #2171 Merged dai-shi merged 1 commit Motivation Static-ness was encoded as the etag value",
      links: [
        { text: "dai-shi", href: "https://github.com/dai-shi" },
        { text: "wakujs/waku", href: "https://github.com/wakujs/waku" },
        { text: "refactor: static etag #2171", href: "https://github.com/wakujs/waku/pull/2171" },
        { text: "Read more", href: "https://github.com/wakujs/waku/pull/2171" },
      ],
    });

    expect(card).toMatchObject({
      id: "feed-item-11077785328",
      type: "pull_request",
      source: "github",
      actor: "dai-shi",
      repo: "wakujs/waku",
      createdAt: "2026-06-27T21:51:24.000-07:00",
      action: "merged",
      prNumber: 2171,
      htmlUrl: "https://github.com/wakujs/waku/pull/2171",
      title: "refactor: static etag #2171",
    });
  });

  it("keeps GitHub Home-only recommendation and trending cards", () => {
    const cards = normalizeHomeCardSnapshots([
      {
        id: "feed-item-0",
        card: {
          card_type: "TRENDING_REPOSITORY",
          created_at: "2026-06-27T04:08:52.000-07:00",
          card_position: 2,
          card_sub_position: 0,
          resource_type: "REPO",
          gatherer: "trending_repositories",
        },
        text:
          "Trending repositories simplex-chat/simplex-chat SimpleX - the first messaging network operating without user identifiers",
        links: [
          { text: "See more", href: "https://github.com/trending" },
          { text: "simplex-chat/simplex-chat", href: "https://github.com/simplex-chat/simplex-chat" },
        ],
      },
      {
        id: "feed-item-0",
        card: {
          card_type: "REPOSITORY_RECOMMENDATION",
          created_at: "2026-06-26T17:00:00.000-07:00",
          card_position: 3,
          card_sub_position: null,
          resource_type: "REPO",
          resource_relationship: "FOLLOWED",
          gatherer: "munger",
        },
        text: "Popular projects among people you follow onnx/onnx Open standard for machine learning interoperability",
        links: [
          { text: "people you follow", href: "https://github.com/PerfectPan?tab=following" },
          { text: "onnx/onnx", href: "https://github.com/onnx/onnx" },
        ],
      },
    ]);

    expect(cards).toMatchObject([
      {
        type: "trending",
        repo: "simplex-chat/simplex-chat",
        actor: "GitHub Home",
        action: "trending",
        title: "simplex-chat/simplex-chat",
      },
      {
        type: "recommendation",
        repo: "onnx/onnx",
        actor: "GitHub Home",
        action: "recommended",
        title: "onnx/onnx",
      },
    ]);
  });

  it("normalizes a rendered Home fork card", () => {
    const card = normalizeHomeCardSnapshot({
      id: "feed-item-11077470689",
      card: {
        card_type: "FORKED_REPOSITORY",
        created_at: "2026-06-27T21:24:13.000-07:00",
        card_position: 1,
        card_sub_position: null,
        resource_type: "REPO",
        gatherer: "repository_mysql",
      },
      text: "magic-akari forked a repository June 27, 2026 21:24 magic-akari/dprint Starred",
      links: [
        { text: "magic-akari", href: "https://github.com/magic-akari" },
        { text: "magic-akari/dprint", href: "https://github.com/magic-akari/dprint" },
      ],
    });

    expect(card).toMatchObject({
      type: "fork",
      actor: "magic-akari",
      repo: "magic-akari/dprint",
      action: "forked",
      htmlUrl: "https://github.com/magic-akari/dprint",
    });
  });

  it("explains how to initialize exact Home mode when storage state is missing", async () => {
    const client = new GitHubHomeClient({
      storageState: ".state/missing-github-home-storage.json",
    });

    await expect(client.getHomeEvents()).rejects.toThrow("Run 'rss-summary github-home login' first");
  });

  it("extracts Home card snapshots from conduit HTML", () => {
    const html = `
      <turbo-frame id="conduit-feed-frame">
        <article class="js-feed-item-component" id="feed-item-11077785328" data-hydro-view='{"payload":{"feed_card":{"card_type":"MERGED_PULL_REQUEST","created_at":"2026-06-27T21:51:24.000-07:00","card_position":0}}}'>
          <a href="https://github.com/dai-shi">dai-shi</a>
          <a href="https://github.com/wakujs/waku">wakujs/waku</a>
          <a href="https://github.com/wakujs/waku/pull/2171">refactor: static etag #2171</a>
        </article>
      </turbo-frame>
    `;

    expect(extractHomeFeedSnapshotsFromHtml(html)).toEqual([
      {
        id: "feed-item-11077785328",
        card: {
          card_type: "MERGED_PULL_REQUEST",
          created_at: "2026-06-27T21:51:24.000-07:00",
          card_position: 0,
        },
        text: "dai-shi wakujs/waku refactor: static etag #2171",
        links: [
          { text: "dai-shi", href: "https://github.com/dai-shi" },
          { text: "wakujs/waku", href: "https://github.com/wakujs/waku" },
          { text: "refactor: static etag #2171", href: "https://github.com/wakujs/waku/pull/2171" },
        ],
      },
    ]);
  });

  it("uses conduit snapshots before rendered browser snapshots", async () => {
    const storageState = createStorageState();
    let browserCalls = 0;
    const client = new GitHubHomeClient({
      storageState,
      conduitFetcher: async () => [
        {
          id: "feed-item-0",
          card: { card_type: "TRENDING_REPOSITORY", created_at: "2026-06-27T04:08:52.000-07:00" },
          text: "Trending repositories simplex-chat/simplex-chat",
          links: [{ text: "simplex-chat/simplex-chat", href: "https://github.com/simplex-chat/simplex-chat" }],
        },
      ],
      browserFetcher: async () => {
        browserCalls += 1;
        return [];
      },
    });

    const events = await client.getHomeEvents();

    expect(events[0]?.repo).toBe("simplex-chat/simplex-chat");
    expect(browserCalls).toBe(0);
  });

  it("falls back to rendered browser snapshots when conduit fails", async () => {
    const storageState = createStorageState();
    const client = new GitHubHomeClient({
      storageState,
      conduitFetcher: async () => {
        throw new Error("conduit failed");
      },
      browserFetcher: async () => [
        {
          id: "feed-item-11077470689",
          card: { card_type: "FORKED_REPOSITORY", created_at: "2026-06-27T21:24:13.000-07:00" },
          text: "magic-akari forked a repository magic-akari/dprint",
          links: [
            { text: "magic-akari", href: "https://github.com/magic-akari" },
            { text: "magic-akari/dprint", href: "https://github.com/magic-akari/dprint" },
          ],
        },
      ],
    });

    const events = await client.getHomeEvents();

    expect(events[0]?.repo).toBe("magic-akari/dprint");
  });

  it("skips conduit when configured for rendered browser mode", async () => {
    const storageState = createStorageState();
    let conduitCalls = 0;
    const client = new GitHubHomeClient({
      storageState,
      fetchMode: "browser",
      conduitFetcher: async () => {
        conduitCalls += 1;
        return [];
      },
      browserFetcher: async () => [
        {
          id: "feed-item-0",
          card: { card_type: "REPOSITORY_RECOMMENDATION", created_at: "2026-06-26T17:00:00.000-07:00" },
          text: "Popular projects among people you follow onnx/onnx",
          links: [{ text: "onnx/onnx", href: "https://github.com/onnx/onnx" }],
        },
      ],
    });

    const events = await client.getHomeEvents();

    expect(events[0]?.repo).toBe("onnx/onnx");
    expect(conduitCalls).toBe(0);
  });
});

function createStorageState(): string {
  const file = join(mkdtempSync(join(tmpdir(), "rss-summary-github-home-")), "storage.json");
  writeFileSync(file, "{}");
  return file;
}
