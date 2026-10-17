import { HttpClientError } from "effect/http";
import { describe, expect, it } from "vite-plus/test";

import {
  asError,
  githubHeaders,
  rssHeaders,
  timeoutFetch,
  webHeaders,
} from "../../../../src/acquisition/infra/adapters/http.js";

describe("acquisition HTTP", () => {
  it("keeps the historical request headers", () => {
    expect(rssHeaders).toEqual({
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "user-agent": "rss-summary/0.1",
    });
    expect(webHeaders).toEqual({
      accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.8",
      "user-agent": "rss-summary/0.1",
    });
    expect(githubHeaders(undefined)).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rss-summary",
    });
    expect(githubHeaders("token").Authorization).toBe("Bearer token");
  });

  it("aborts with TimeoutError and unwraps a transport failure", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason);
        });
      });
    await expect(timeoutFetch(hanging, 20)("https://example.com")).rejects.toMatchObject({
      name: "TimeoutError",
    });

    const cause = new TypeError("network reset");
    const wrapped = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request: { method: "GET", url: "https://example.com", urlParams: [] } as never,
        cause,
      }),
    });
    expect(asError(wrapped)).toBe(cause);
    expect(asError(cause).message).toBe("network reset");
  });
});
