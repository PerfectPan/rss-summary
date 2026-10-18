import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { runDigestCommand } from "../../../../src/app/products/subscriptions/cli.js";

describe("subscriptions digest CLI", () => {
  it("reports configuration errors on stderr with exit code 1", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "rss-summary-cli-"));
    const missingIndustry = join(temporaryDirectory, "missing-industry.json");
    const stderr: string[] = [];

    try {
      const previous = process.env.INDUSTRY_SOURCES_FILE;
      process.env.INDUSTRY_SOURCES_FILE = missingIndustry;
      const code = await runDigestCommand([], {
        stderr: { write: (chunk) => stderr.push(String(chunk)) },
      });
      process.env.INDUSTRY_SOURCES_FILE = previous;

      expect(code).toBe(1);
      expect(stderr.join("")).toContain(
        `Industry source configuration file does not exist: ${missingIndustry}`,
      );
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
