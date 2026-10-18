import { describe, expect, it } from "vite-plus/test";

import { acquireGitHubEvent, normalizeEvent } from "./github-event.js";

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
    expect(merged.item.signals).toEqual([{ type: "change-merged", label: "pull request merged" }]);
    expect(merged.item.kind).toBe("change");

    expect(
      acquireGitHubEvent({ type: "PullRequestEvent", payload: { action: "opened" } }).item
        .signals[0]?.type,
    ).toBe("change-opened");
    expect(
      acquireGitHubEvent({ type: "PullRequestEvent", payload: { action: "closed" } }).item
        .signals[0]?.type,
    ).toBe("change-closed");
    expect(
      acquireGitHubEvent({ type: "PullRequestEvent", payload: { action: "reviewed" } }).item
        .signals[0]?.type,
    ).toBe("change-other");
    expect(acquireGitHubEvent({ type: "WatchEvent" }).item.signals[0]).toEqual({
      type: "endorsed",
      label: "followee starred this repository",
    });
    expect(acquireGitHubEvent({ type: "ForkEvent" }).item.signals[0]?.type).toBe("forked");
    expect(
      acquireGitHubEvent({ type: "CreateEvent", payload: { ref_type: "repository" } }).item
        .signals[0]?.type,
    ).toBe("created");
    expect(
      acquireGitHubEvent({ type: "CreateEvent", payload: { ref_type: "branch" } }).item.signals,
    ).toEqual([]);
    expect(acquireGitHubEvent({ type: "ReleaseEvent" }).item).toMatchObject({
      kind: "release",
      signals: [{ type: "released", label: "new release published" }],
    });
    expect(acquireGitHubEvent({ type: "PublicEvent" }).item.signals).toEqual([]);
  });
});
