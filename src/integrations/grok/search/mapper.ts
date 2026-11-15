import { Schema } from "effect";

import { NewsSearchError, type SearchResult } from "../../../acquisition/index.js";
import type { Item } from "../../../acquisition/index.js";

import { isPlainObject } from "../../shared/json-record.js";
import { itemFromSearchResult } from "../../shared/search-item.js";
import type { AuditedSearchPage } from "../audit.js";
import { postSchema, responseSchema, trackNativeSearchEvent } from "./dto.js";

export type GrokAcquired = {
  page: AuditedSearchPage;
  items: Item[];
};

const badge = "Grok 原生 X 搜索，内容经模型整理；未独立核验作者或原文";

function itemFromGrok(result: SearchResult): Item {
  return itemFromSearchResult(result, {
    kind: "post",
    excerpt: result.summary,
    publishedAt: { value: result.publishTime ?? "", precision: "instant" },
    provenance: { origin: result.url, note: badge },
    credibility: { tier: "unrated" }
  });
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function parseGrokStream(
  stream: string,
  count: number,
  since: number,
  until: number,
  allowedHandle?: string
): GrokAcquired {
  try {
    const calls = new Set<string>();
    const nativeTools = new Set<string>();
    let finalText = "";
    let end: Record<string, unknown> | undefined;
    for (const line of stream.split(/\r?\n/u).filter((line) => line.trim())) {
      const event: unknown = JSON.parse(line);
      if (!isPlainObject(event)) {
        throw new Error("Invalid event");
      }
      if (end) {
        throw new Error("Events after completion");
      }
      const receipt = trackNativeSearchEvent(event, calls);
      if (receipt !== undefined) {
        nativeTools.add(receipt);
        finalText = "";
      }
      if (event.type === "text" && typeof event.data === "string") {
        finalText += event.data;
      }
      if (event.type === "end") {
        end = event;
      }
    }
    if (!end || end.stopReason !== "end_turn" || !nativeTools.size) {
      throw new Error("Missing native search receipt or completion");
    }
    const json = finalText.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u, "$1");
    const response = Schema.decodeUnknownSync(responseSchema)(JSON.parse(json));
    const ids = new Set<string>();
    const results: SearchResult[] = [];
    let rejectedResults = 0;
    for (const candidate of response.posts) {
      try {
        const post = Schema.decodeUnknownSync(postSchema)(candidate);
        const url = new URL(post.url);
        const match = /^\/([a-zA-Z0-9_]{1,15})\/status\/(\d{15,20})\/?$/u.exec(url.pathname);
        if (
          url.protocol !== "https:" ||
          !["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(url.hostname) ||
          url.username ||
          url.password ||
          url.port ||
          !match
        ) {
          throw new Error("Invalid post link");
        }
        const handle = match[1]!;
        const id = match[2]!;
        if (
          post.author.replace(/^@/u, "").toLowerCase() !== handle.toLowerCase() ||
          (allowedHandle && handle.toLowerCase() !== allowedHandle.toLowerCase()) ||
          ids.has(id)
        ) {
          throw new Error("Mismatched author or duplicate");
        }
        const instant = Number((BigInt(id) >> 22n) + 1288834974657n);
        const claimed = Date.parse(post.publishedAt);
        if (
          !/(?:Z|[+-]\d{2}:\d{2})$/u.test(post.publishedAt) ||
          !Number.isFinite(claimed) ||
          Math.abs(claimed - instant) > 60_000 ||
          instant < since ||
          instant >= until
        ) {
          throw new Error("Invalid publication time");
        }
        ids.add(id);
        results.push({
          id,
          title: post.title,
          summary: post.summary,
          url: `https://x.com/${handle.toLowerCase()}/status/${id}`,
          siteName: `@${handle} · X（Grok 整理）`,
          publishTime: new Date(instant).toISOString(),
          rankPosition: results.length + 1,
          authInfoLevel: 4,
          authInfoDescription: badge
        });
      } catch {
        rejectedResults += 1;
      }
    }
    const usage = isPlainObject(end.usage) ? end.usage : {};
    const page = {
      provider: "grok" as const,
      resultCount: results.length,
      results: results.slice(0, count),
      grok: {
        nativeTools: [...nativeTools],
        nativeCallCount: calls.size,
        rejectedResults,
        costUsd: nonNegativeNumber(end.total_cost_usd),
        totalTokens: nonNegativeNumber(usage.total_tokens),
        inputTokens: nonNegativeNumber(usage.input_tokens),
        cachedInputTokens: nonNegativeNumber(usage.cache_read_input_tokens),
        outputTokens: nonNegativeNumber(usage.output_tokens)
      }
    };
    return { page, items: page.results.map(itemFromGrok) };
  } catch (cause) {
    if (cause instanceof NewsSearchError) {
      throw cause;
    }
    throw new NewsSearchError(
      "grok_invalid_response",
      "Grok response lacks a completed native X search receipt, valid completion or structured results."
    );
  }
}
