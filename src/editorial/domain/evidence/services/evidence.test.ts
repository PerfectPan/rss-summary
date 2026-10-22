import { describe, expect, it } from "vite-plus/test";

import { candidateEvidenceUrl, candidateIdentity } from "../../../../integrations/shared/index.js";
import { assembleSubscriptionEvidence } from "../../../index.js";
import type { EvidenceDocument } from "../value-objects/evidence.js";

// The product entry (app/products/subscriptions/output.ts) injects the
// acquisition identity into these assembly functions; the tests rebuild that
// combination so they stay inside editorial's boundary.
const evidenceIdentity = {
  identify: candidateIdentity,
  fallbackUrl: candidateEvidenceUrl,
};

const buildSubscriptionEvidence = (document: EvidenceDocument) =>
  assembleSubscriptionEvidence(document, evidenceIdentity);

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

type Document = EvidenceDocument & {
  generatedAt: string;
  username: string;
};

function document(): Document {
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
