import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("package CLI metadata", () => {
  it("exposes a built rss-summary bin entry", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(pkg.bin?.["rss-summary"]).toBe("./dist/cli.js");
    expect(pkg.scripts?.build).toBe("tsc -p tsconfig.build.json");
  });
});
