import { describe, expect, it } from "vite-plus/test";

import {
  acquireGitHubEvent,
  normalizeEvent,
} from "../../../../../src/acquisition/domain/item/adapters/github-event.js";

describe("github event adapter", () => {
  it("keeps an empty card when the payload is not an object", () => {
    expect(normalizeEvent(null)).toEqual({
      id: "",
      actor: "",
      repo: "",
      createdAt: "",
      type: "other",
    });
  });

  it("maps each scored event onto one signal", () => {
    const merged = acquireGitHubEvent({
      id: "1",
      type: "PullRequestEvent",
      actor: { login: "ada" },
      repo: { name: "acme/kit" },
      created_at: "2026-06-22T09:48:29Z",
      payload: {
        action: "merged",
        number: 12,
        pull_request: { title: "Add search", html_url: "https://github.com/acme/kit/pull/12" },
      },
    });
    expect(merged.card).toMatchObject({ type: "pull_request", action: "merged", prNumber: 12 });
    expect(merged.item.signals).toEqual([
      { type: "pull-request-merged", label: "pull request merged" },
    ]);
    expect(merged.item.kind).toBe("change");

    expect(
      acquireGitHubEvent({ type: "PullRequestEvent", payload: { action: "opened" } }).item
        .signals[0]?.type,
    ).toBe("pull-request-opened");
    expect(
      acquireGitHubEvent({ type: "PullRequestEvent", payload: { action: "closed" } }).item
        .signals[0]?.type,
    ).toBe("pull-request-closed");
    expect(
      acquireGitHubEvent({ type: "PullRequestEvent", payload: { action: "reviewed" } }).item
        .signals[0]?.type,
    ).toBe("pull-request");
    expect(acquireGitHubEvent({ type: "WatchEvent" }).item.signals[0]).toEqual({
      type: "watch",
      label: "followee starred this repository",
    });
    expect(acquireGitHubEvent({ type: "ForkEvent" }).item.signals[0]?.type).toBe("fork");
    expect(
      acquireGitHubEvent({ type: "CreateEvent", payload: { ref_type: "repository" } }).item
        .signals[0]?.type,
    ).toBe("create");
    expect(
      acquireGitHubEvent({ type: "CreateEvent", payload: { ref_type: "branch" } }).item.signals,
    ).toEqual([]);
    expect(acquireGitHubEvent({ type: "ReleaseEvent" }).item).toMatchObject({
      kind: "release",
      signals: [{ type: "release", label: "new release published" }],
    });
    expect(acquireGitHubEvent({ type: "PublicEvent" }).item.signals).toEqual([]);
  });
});
