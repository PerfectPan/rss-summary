import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import {
  checkBoundaries,
  type SourceInput,
  type Violation,
} from "../../scripts/architecture/check.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("architecture boundaries", () => {
  it("keeps the whole src tree free of boundary violations", () => {
    const files = walk(join(root, "src")).map((path) => ({
      path: relative(root, path).split("\\").join("/"),
      source: readFileSync(path, "utf8"),
    }));
    const violations = checkBoundaries(files);

    console.error(`architecture baseline: ${violations.length} violation(s)`);
    for (const violation of violations) {
      console.error(`${violation.file}: ${violation.rule}: ${violation.message}`);
    }

    expect(violations).toEqual([]);
  });

  it("accepts a legal import graph", () => {
    expect(rulesOf(checkBoundaries(legalGraph()))).toEqual([]);
  });

  it("detects a domain import of node:fs or effect", () => {
    const file = "src/acquisition/domain/item/model.ts";
    const violations = checkBoundaries([
      {
        path: file,
        source: [
          'import { readFileSync } from "node:fs";',
          'import { Effect } from "effect";',
          "export const value = readFileSync;",
          "export const effect = Effect;",
        ].join("\n"),
      },
    ]);

    expect(rulesOf(violations, file)).toEqual(["effect", "node-builtin"]);
  });

  it("accepts sibling tests using node builtins, Effect, and cross-module index imports", () => {
    expect(rulesOf(checkBoundaries(testGraph()))).toEqual([]);
  });

  it("restricts Effect.run* to the app runtime, exempting test files", () => {
    const violations = checkBoundaries([
      {
        path: "src/app/runtime.ts",
        source: "export const run = Effect.runPromise;\n",
      },
      {
        path: "src/kernel/text.test.ts",
        source: "export const run = () => Effect.runPromise(Promise.resolve(1));\n",
      },
      {
        path: "src/acquisition/infra/adapters/rss-http.ts",
        source: "export const run = () => Effect.runPromise(Promise.resolve(1));\n",
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/acquisition/infra/adapters/rss-http.ts effect-run",
    ]);
  });

  it("detects sibling tests reaching into another module's internals", () => {
    const file = "src/kernel/text.test.ts";
    const violations = checkBoundaries([
      {
        path: file,
        source: [
          'import { readFileSync } from "node:fs";',
          'import { Effect } from "effect";',
          'import { collectRssFeeds } from "../acquisition/index.js";',
          'import { RssClient } from "../acquisition/infra/adapters/rss-http.js";',
          'import { suite } from "../../tests/support/suite.js";',
          'import { gone } from "../../../../outside.js";',
          "export const value = [readFileSync, Effect, collectRssFeeds, RssClient, suite, gone];",
        ].join("\n"),
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/kernel/text.test.ts deep-import",
      "src/kernel/text.test.ts relative-escape",
    ]);
  });

  it("detects layer, type-only, deep import, clock, and source-vocabulary violations", () => {
    const violations = checkBoundaries([
      {
        path: "src/acquisition/domain/item/model.ts",
        source: [
          'import { readRss } from "./adapters/rss.js";',
          "export const now = new Date();",
          "export const label = Date.now();",
          'export const source = "github";',
          "export const adapter = readRss;",
        ].join("\n"),
      },
      {
        path: "src/acquisition/domain/item/adapters/rss.ts",
        source: 'import { Effect } from "effect";\nexport const effect = Effect;\n',
      },
      {
        path: "src/acquisition/application/use-cases/search.ts",
        source: [
          'import { read } from "../../infra/adapters/rss-http.js";',
          'import { readFileSync } from "node:fs";',
          "const token = process.env.TOKEN;",
          'console.error("search");',
          "export const value = [read, readFileSync, token];",
        ].join("\n"),
      },
      {
        path: "src/editorial/domain/news/rank.ts",
        source:
          'import { value } from "../../../acquisition/domain/item/model.js";\nexport const ranked = value;\n',
      },
      {
        path: "src/app/products/news/flow.ts",
        source:
          'import { search } from "../../../acquisition/application/use-cases/search.js";\nexport const flow = search;\n',
      },
      {
        path: "src/acquisition/infra/adapters/rss-http.ts",
        source: 'import { chromium } from "playwright";\nexport const browser = chromium;\n',
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/acquisition/application/use-cases/search.ts console",
      "src/acquisition/application/use-cases/search.ts layer",
      "src/acquisition/application/use-cases/search.ts node-builtin",
      "src/acquisition/application/use-cases/search.ts process-env",
      "src/acquisition/domain/item/adapters/rss.ts effect",
      "src/acquisition/domain/item/model.ts clock",
      "src/acquisition/domain/item/model.ts layer",
      "src/acquisition/domain/item/model.ts source-vocabulary",
      "src/acquisition/infra/adapters/rss-http.ts playwright",
      "src/app/products/news/flow.ts deep-import",
      "src/editorial/domain/news/rank.ts types-only",
    ]);
  });
});

/** Sibling tests may bypass their layer's rules but not module internals. */
function testGraph(): SourceInput[] {
  return [
    {
      path: "src/kernel/text.test.ts",
      source: [
        'import { readFileSync } from "node:fs";',
        'import { Effect, Layer } from "effect";',
        'import { err } from "./result.js";',
        "export const value = [readFileSync, Effect, Layer, err];",
      ].join("\n"),
    },
    {
      path: "src/acquisition/domain/item/item.test.ts",
      source: [
        'import { Effect } from "effect";',
        'import { readConduit } from "../../infra/adapters/browser.js";',
        'import { scoreAcquired } from "../../../editorial/index.js";',
        'import { suite } from "../../../../tests/support/search-provider-suite.js";',
        "export const value = [Effect, readConduit, scoreAcquired, suite];",
      ].join("\n"),
    },
  ];
}

function legalGraph(): SourceInput[] {
  return [
    { path: "src/kernel/text.ts", source: "export const empty = '';\n" },
    {
      path: "src/acquisition/domain/item/model.ts",
      source:
        'import { empty } from "../../../kernel/text.js";\nexport const created = (value: string) => new Date(value);\nexport const label = empty;\n',
    },
    {
      path: "src/acquisition/domain/item/adapters/rss.ts",
      source:
        'import { Schema } from "effect";\nimport { created } from "../model.js";\nexport const parsed = [Schema, created];\n',
    },
    {
      path: "src/acquisition/application/use-cases/search.ts",
      source:
        'import { Effect } from "effect";\nimport { created } from "../../domain/item/model.js";\nexport const search = [Effect, created];\n',
    },
    {
      path: "src/acquisition/infra/adapters/browser.ts",
      source: 'import { chromium } from "playwright";\nexport const browser = chromium;\n',
    },
    {
      path: "src/acquisition/infra/adapters/rss-http.ts",
      source:
        'import { parsed } from "../../domain/item/adapters/rss.js";\nexport const events = parsed;\n',
    },
    {
      path: "src/editorial/domain/news/rank.ts",
      source:
        'import type { created } from "../../../acquisition/domain/item/model.js";\nimport { empty } from "../../../kernel/text.js";\nexport const rank = [empty, created];\n',
    },
    {
      path: "src/app/products/news/flow.ts",
      source:
        'import { search } from "../../../acquisition/index.js";\nimport { empty } from "../../../kernel/index.js";\nexport const flow = [search, empty];\n',
    },
  ];
}

function rulesOf(violations: Violation[], file?: string): string[] {
  return violations
    .filter((violation) => file === undefined || violation.file === file)
    .map((violation) => violation.rule)
    .sort();
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) files.push(path);
  }
  return files;
}
