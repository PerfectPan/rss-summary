import { describe, expect, it } from "vite-plus/test";

import {
  isSameEntityEvent,
  isSameHeadline,
  isSameTitleEvent,
} from "../../../../src/editorial/domain/identity/identity.js";

describe("editorial identity", () => {
  it("matches overlapping titles and normalized headlines", () => {
    expect(
      isSameTitleEvent(
        { title: "Claude 3.7 发布重大更新" },
        { title: "Claude 3.7 重大更新发布详情" },
      ),
    ).toBe(true);
    expect(isSameTitleEvent({ title: "A" }, { title: "B" })).toBe(false);
    expect(isSameHeadline("Hello   WORLD", "hello world")).toBe(true);
    expect(isSameHeadline("Hello", "Hello!")).toBe(false);
    expect(
      isSameEntityEvent(
        { url: "https://a.example/post", title: "One" },
        { url: "https://a.example/post", title: "Two" },
      ),
    ).toBe(true);
    expect(
      isSameEntityEvent(
        { url: "https://a.example/post", title: "Same Title" },
        { url: "https://b.example/other", title: "same   title" },
      ),
    ).toBe(true);
  });
});
