import { describe, expect, it } from "vite-plus/test";

import {
  buildSubscriptionEditorial,
  buildSubscriptionEvidence,
  validateSubscriptionEditorialDraft,
  validateSubscriptionSelectionDraft,
} from "../../src/domain/subscription-editorial.js";
import type { DigestDocument } from "../../src/domain/digest.js";

describe("subscription editorial contract", () => {
  it("exposes deterministic repository facts and requests summaries only for PR/RSS evidence", () => {
    const evidence = buildSubscriptionEvidence(document());

    expect(evidence).toEqual([
      expect.objectContaining({
        id: "github-repository:example/project",
        kind: "repository",
        facts: ["⭐ 12.3k", "TypeScript"],
        summaryPolicy: "none",
      }),
      expect.objectContaining({
        id: "github-pull-request:example/project:41",
        kind: "pull-request",
        summaryPolicy: "required",
      }),
      expect.objectContaining({
        id: "publication:https://deno.com/blog/v2.4",
        kind: "article",
        summaryPolicy: "required",
      }),
    ]);
  });

  it("accepts grounded one-to-two sentence summaries and rejects unknown references", () => {
    const evidence = buildSubscriptionEvidence(document());
    expect(
      validateSubscriptionEditorialDraft(
        [
          {
            ref: "github-pull-request:example/project:41",
            summary: "为上传流程增加断点续传。网络中断后可从检查点继续。",
          },
          {
            ref: "publication:https://deno.com/blog/v2.4",
            summary: "文章介绍 Deno 2.4 的运行时更新，并说明 TypeScript 工作流的变化。",
          },
        ],
        evidence,
      ),
    ).toHaveLength(2);
    expect(() =>
      validateSubscriptionEditorialDraft([{ ref: "missing", summary: "不存在的证据。" }], evidence),
    ).toThrow(/unknown reference/u);
  });

  it("treats AI selection as an explicit second pass and rejects omitted evidence", () => {
    const evidence = buildSubscriptionEvidence(document());
    const selection = validateSubscriptionSelectionDraft(
      [
        {
          ref: "github-repository:example/project",
          selected: false,
          reason: "普通 star 活动，没有足够的新信息。",
        },
        {
          ref: "github-pull-request:example/project:41",
          selected: true,
          reason: "包含明确的上传恢复能力变化，值得关注。",
        },
      ],
      evidence,
    );

    expect([...selection.selectedRefs]).toEqual(["github-pull-request:example/project:41"]);
    expect(selection.decisions).toEqual([
      expect.objectContaining({
        ref: "github-repository:example/project",
        selected: false,
      }),
      expect.objectContaining({
        ref: "github-pull-request:example/project:41",
        selected: true,
      }),
      expect.objectContaining({
        ref: "publication:https://deno.com/blog/v2.4",
        reason: "AI selection omitted this item",
        selected: false,
      }),
    ]);
  });

  it("keeps valid summaries when another draft item is invalid", () => {
    const editorial = buildSubscriptionEditorial(document(), [
      {
        ref: "github-pull-request:example/project:41",
        summary: "为上传流程增加断点续传。网络中断后可从检查点继续。",
      },
      {
        ref: "publication:https://deno.com/blog/v2.4",
        summary: "文章声称包含 99 项来源中不存在的变化。",
      },
    ]);

    expect(editorial.summaries.get("github-pull-request:example/project:41")).toBe(
      "为上传流程增加断点续传。网络中断后可从检查点继续。",
    );
    expect(editorial.summaries.get("publication:https://deno.com/blog/v2.4")).toBe(
      "Runtime updates for TypeScript and JavaScript.",
    );
  });

  it("rejects more than two sentences across Chinese and ASCII punctuation", () => {
    const evidence = buildSubscriptionEvidence(document());
    expect(() =>
      validateSubscriptionEditorialDraft(
        [
          {
            ref: "github-pull-request:example/project:41",
            summary: "先保存检查点; 再恢复上传. 最后报告结果。",
          },
        ],
        evidence,
      ),
    ).toThrow(/at most two sentences/u);
  });

  it("exposes only candidates that fit the rendered subscription sections", () => {
    const base = document();
    const articles = Array.from({ length: 25 }, (_, index) => ({
      ...base.candidates[2]!,
      repo: `rss:https://example.com/${index}`,
      events: [
        {
          ...base.candidates[2]!.events[0]!,
          id: `rss-${index}`,
          repo: `rss:https://example.com/${index}`,
          htmlUrl: `https://example.com/${index}`,
        },
      ],
      url: `https://example.com/${index}`,
    }));

    const evidence = buildSubscriptionEvidence({ ...base, candidates: articles });

    expect(evidence).toHaveLength(20);
    expect(evidence.every(({ summaryPolicy }) => summaryPolicy === "required")).toBe(true);
  });
});

function document(): DigestDocument {
  return {
    generatedAt: "2026-08-15T12:00:00Z",
    username: "PerfectPan",
    candidates: [
      {
        repo: "example/project",
        source: "github",
        category: "discovery",
        score: 90,
        actors: ["alice"],
        eventTypes: ["watch"],
        reasons: [],
        events: [
          {
            id: "star-1",
            type: "watch",
            actor: "alice",
            repo: "example/project",
            createdAt: "2026-08-15T09:00:00Z",
          },
        ],
        repository: {
          fullName: "example/project",
          htmlUrl: "https://github.com/example/project",
          description: "A useful project.",
          language: "TypeScript",
          stargazersCount: 12_345,
          topics: [],
          pushedAt: "2026-08-15T00:00:00Z",
        },
      },
      {
        repo: "example/project",
        source: "github",
        category: "activity",
        score: 35,
        actors: ["bob"],
        eventTypes: ["pull_request"],
        reasons: [],
        events: [
          {
            id: "pr-41",
            type: "pull_request",
            actor: "bob",
            repo: "example/project",
            createdAt: "2026-08-15T10:00:00Z",
            prNumber: 41,
            title: "Add resumable uploads",
            summary: "Adds checkpointed upload state so interrupted transfers can resume.",
            htmlUrl: "https://github.com/example/project/pull/41",
          },
        ],
        label: "example/project #41 · Add resumable uploads",
        url: "https://github.com/example/project/pull/41",
        description: "Adds checkpointed upload state so interrupted transfers can resume.",
      },
      {
        repo: "rss:https://deno.com/blog/v2.4",
        source: "rss",
        category: "article",
        score: 30,
        actors: ["Deno Blog"],
        eventTypes: ["article"],
        reasons: [],
        events: [
          {
            id: "rss-1",
            type: "article",
            source: "rss",
            actor: "Deno Blog",
            repo: "rss:https://deno.com/blog/v2.4",
            createdAt: "2026-08-15T11:00:00Z",
            title: "Deno 2.4",
            summary: "Runtime updates for TypeScript and JavaScript.",
            htmlUrl: "https://deno.com/blog/v2.4",
          },
        ],
        label: "Deno 2.4",
        url: "https://deno.com/blog/v2.4",
        description: "Runtime updates for TypeScript and JavaScript.",
      },
    ],
  };
}
