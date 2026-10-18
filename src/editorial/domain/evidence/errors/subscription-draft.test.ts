import { describe, expect, it } from "vite-plus/test";

import { candidateEvidenceUrl, candidateIdentity } from "../../../../acquisition/index.js";
import { assembleSubscriptionEditorial } from "../../../index.js";
import { SubscriptionDraftValidationError } from "./subscription-draft.js";
import type { EvidenceDocument } from "../value-objects/evidence.js";

// The product entry (app/products/subscriptions/output.ts) injects the
// acquisition identity into these assembly functions; the tests rebuild that
// combination so they stay inside editorial's boundary.
const evidenceIdentity = {
  identify: candidateIdentity,
  fallbackUrl: candidateEvidenceUrl,
};

const buildSubscriptionEditorial = (
  document: EvidenceDocument,
  draft?: unknown,
  research?: unknown,
) => assembleSubscriptionEditorial(document, evidenceIdentity, draft, research);

describe("subscription editorial contract", () => {
  it("returns a retryable error when a draft item is invalid", () => {
    expect(() =>
      buildSubscriptionEditorial(document(), [
        {
          ref: "github-pull-request:example/project:41",
          summary: "为上传流程增加断点续传。网络中断后可从检查点继续。",
        },
        {
          ref: "publication:https://deno.com/blog/v2.4",
          summary: "文章声称包含 99 项来源中不存在的变化。",
        },
      ]),
    ).toThrow(SubscriptionDraftValidationError);

    try {
      buildSubscriptionEditorial(document(), [
        {
          ref: "publication:https://deno.com/blog/v2.4",
          summary: "文章声称包含 99 项来源中不存在的变化。",
        },
      ]);
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toMatchObject({ code: "SUBSCRIPTION_SUMMARY_VALIDATION_FAILED" });
      expect((error as SubscriptionDraftValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("numeric claim 99"),
            ref: "publication:https://deno.com/blog/v2.4",
          }),
        ]),
      );
    }
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
