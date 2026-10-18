import { describe, expect, it } from "vite-plus/test";

import {
  isPrivateIpv4,
  isVideoResearchUrl,
  validateArticleResearchUrl,
  validateResearchUrl,
} from "./url-policy.js";

describe("research URL policy", () => {
  it("accepts a public article URL and rejects private or credentialed targets", () => {
    expect(validateResearchUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(() => validateResearchUrl("http://127.0.0.1/admin")).toThrow(
      "article URL points to a private or local host",
    );
    expect(() => validateResearchUrl("https://user:secret@example.com/a")).toThrow(
      "article URL must not contain credentials",
    );
    expect(() => validateResearchUrl("ftp://example.com/a")).toThrow(
      "article URL must use http or https",
    );
  });

  it("rejects video pages from the article reader", () => {
    expect(() => validateArticleResearchUrl("https://youtu.be/example")).toThrow(
      "video research requires captions or a transcript",
    );
    expect(isVideoResearchUrl("https://example.com/talk.mp4")).toBe(true);
    expect(isVideoResearchUrl("https://example.com/article")).toBe(false);
  });

  it("recognizes private IPv4 ranges", () => {
    expect(isPrivateIpv4("10.1.1.1")).toBe(true);
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("example.com")).toBe(false);
  });
});
