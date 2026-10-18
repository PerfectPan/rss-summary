import { describe, expect, it } from "vite-plus/test";

import { decodeFeedsJson } from "./feeds.js";

describe("feeds.json", () => {
  it("keeps the hand parser's document and error text", () => {
    expect(
      decodeFeedsJson(
        JSON.stringify([
          { url: "https://example.com/feed.xml", name: "Example", tags: ["ai"], extra: true },
        ]),
      ),
    ).toEqual([{ name: "Example", url: "https://example.com/feed.xml", tags: ["ai"] }]);
    expect(decodeFeedsJson('["https://www.example.com/feed.xml"]')).toEqual([
      { name: "example.com", url: "https://www.example.com/feed.xml", tags: [] },
    ]);
    expect(() => decodeFeedsJson("{")).toThrow(SyntaxError);
    expect(() => decodeFeedsJson("{}")).toThrow("RSS feed configuration must be a JSON array.");
    expect(() => decodeFeedsJson('[{"type":"page","url":"https://example.com"}]')).toThrow(
      "Personal feed configuration only supports RSS or Atom sources.",
    );
  });
});
