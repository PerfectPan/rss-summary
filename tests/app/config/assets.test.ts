import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  defaultIndustrySourcesFile,
  defaultNewsTopicsFile,
  packageAsset,
} from "../../../src/app/config/assets.js";

describe("app/config/assets", () => {
  it("resolves packaged assets from the package root", () => {
    const industry = defaultIndustrySourcesFile();
    const topics = defaultNewsTopicsFile();

    expect(JSON.parse(readFileSync(industry, "utf8"))).toEqual(
      JSON.parse(readFileSync(new URL("../../../industry-feeds.json", import.meta.url), "utf8")),
    );
    expect(JSON.parse(readFileSync(topics, "utf8"))).toEqual(
      JSON.parse(readFileSync(new URL("../../../news-topics.json", import.meta.url), "utf8")),
    );
    expect(packageAsset("README.md")).toContain("rss-summary");
  });
});
