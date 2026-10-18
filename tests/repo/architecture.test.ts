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

    expect(violations).toEqual([]);
  });

  it("accepts a legal import graph", () => {
    expect(rulesOf(checkBoundaries(legalGraph()))).toEqual([]);
  });

  it("detects a domain import of node:fs or effect", () => {
    const file = "src/acquisition/domain/item/value-objects/model.ts";
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

  it("accepts products importing the shared composition, not each other", () => {
    expect(
      rulesOf(
        checkBoundaries([
          {
            path: "src/app/products/frontier/flow.ts",
            source: [
              'import { collectIndustryBrief } from "../shared/industry.js";',
              'import { tool } from "./tool.js";',
              "export const flow = [collectIndustryBrief, tool];",
            ].join("\n"),
          },
          {
            path: "src/app/products/shared/industry.ts",
            source: [
              'import { candidateDecision } from "./candidate-decision.js";',
              'import { collectSources } from "../../../acquisition/index.js";',
              "export const industry = [candidateDecision, collectSources];",
            ].join("\n"),
          },
          // The registry directly under products/ composes every product.
          {
            path: "src/app/products/index.ts",
            source:
              'import { frontierToolDescriptor } from "./frontier/tool.js";\nexport const descriptor = frontierToolDescriptor;\n',
          },
          // Sibling tests keep their exemption from product isolation.
          {
            path: "src/app/products/daily-ai/flow.test.ts",
            source:
              'import { generateNewsBrief } from "../news/flow.js";\nexport const spy = generateNewsBrief;\n',
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("detects a product importing another product, value or type", () => {
    const violations = checkBoundaries([
      {
        path: "src/app/products/daily-ai/flow.ts",
        source:
          'import { buildIndustryDocument } from "../frontier/flow.js";\nexport const flow = buildIndustryDocument;\n',
      },
      {
        path: "src/app/products/frontier/flow.ts",
        source:
          'import { candidateDecision } from "../subscriptions/output.js";\nexport const flow = candidateDecision;\n',
      },
      {
        path: "src/app/products/research/cli.ts",
        source:
          'import { createGlmResearch } from "../news/hybrid.js";\nexport const cli = createGlmResearch;\n',
      },
      {
        path: "src/app/products/subscriptions/automation.ts",
        source:
          'import { RSS_SUMMARY_RESEARCH_TOOL_ID } from "../research/tool.js";\nexport const automation = RSS_SUMMARY_RESEARCH_TOOL_ID;\n',
      },
      {
        path: "src/app/products/daily-ai/tool.ts",
        source:
          'import type { IndustryBriefDocument } from "../frontier/flow.js";\nexport type Doc = IndustryBriefDocument;\n',
      },
      // shared/ must stay product-agnostic.
      {
        path: "src/app/products/shared/industry.ts",
        source:
          'import { buildIndustryDocument } from "../frontier/tool.js";\nexport const industry = buildIndustryDocument;\n',
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/app/products/daily-ai/flow.ts product-boundary",
      "src/app/products/daily-ai/tool.ts product-boundary",
      "src/app/products/frontier/flow.ts product-boundary",
      "src/app/products/research/cli.ts product-boundary",
      "src/app/products/shared/industry.ts product-boundary",
      "src/app/products/subscriptions/automation.ts product-boundary",
    ]);
  });

  it("detects module, escape, external, and entry vocabulary violations", () => {
    const violations = checkBoundaries([
      {
        path: "src/editorial/domain/news/policies/rank.ts",
        source:
          'import { deliver } from "../../../../delivery/index.js";\nexport const ranked = deliver;\n',
      },
      {
        path: "src/kernel/text.ts",
        source: 'import { gone } from "../../outside.js";\nexport const text = gone;\n',
      },
      {
        path: "src/acquisition/domain/item/value-objects/item.ts",
        source: 'import { load } from "cheerio";\nexport const item = load;\n',
      },
      {
        path: "src/kernel/text.ts",
        source: 'import { tool } from "@rivus/agent";\nexport const text = tool;\n',
      },
      {
        path: "src/editorial/index.ts",
        source: 'export const note = "github";\n',
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/acquisition/domain/item/value-objects/item.ts external",
      "src/editorial/domain/news/policies/rank.ts module-dependency",
      "src/editorial/index.ts source-vocabulary",
      "src/kernel/text.ts external",
      "src/kernel/text.ts relative-escape",
    ]);
  });

  it("allows infra consoles, parser packages, and Rivus imports at the app boundary", () => {
    expect(
      rulesOf(
        checkBoundaries([
          {
            path: "src/delivery/infra/adapters/notifier.ts",
            source: [
              'import { appendFileSync } from "node:fs";',
              'import { load } from "cheerio";',
              "const webhook = process.env.NOTIFY_WEBHOOK_URL;",
              'console.error("delivery failed");',
              "export const notifier = [appendFileSync, load, webhook];",
            ].join("\n"),
          },
          {
            path: "src/app/rivus/plugin.ts",
            source: 'import { tool } from "@rivus/agent";\nexport const plugin = tool;\n',
          },
        ]),
      ),
    ).toEqual([]);
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
        path: "src/acquisition/domain/item/value-objects/model.ts",
        source: [
          'import { readRss } from "../adapters/rss.js";',
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
        path: "src/editorial/domain/news/policies/rank.ts",
        source:
          'import { value } from "../../../../acquisition/domain/item/value-objects/model.js";\nexport const ranked = value;\n',
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
      "src/acquisition/domain/item/value-objects/model.ts clock",
      "src/acquisition/domain/item/value-objects/model.ts layer",
      "src/acquisition/domain/item/value-objects/model.ts source-vocabulary",
      "src/acquisition/infra/adapters/rss-http.ts playwright",
      "src/app/products/news/flow.ts deep-import",
      "src/editorial/domain/news/policies/rank.ts types-only",
    ]);
  });

  it("keeps domain concepts to building blocks and their facade", () => {
    const violations = checkBoundaries([
      {
        path: "src/acquisition/domain/item/item.ts",
        source: "export const loose = true;\n",
      },
      {
        path: "src/editorial/domain/news/projections/model.ts",
        source: "export const nested = true;\n",
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/acquisition/domain/item/item.ts concept-structure",
      "src/editorial/domain/news/projections/model.ts concept-structure",
    ]);
  });

  it("allows concept facades, building blocks, and loose concept test files", () => {
    expect(
      rulesOf(
        checkBoundaries([
          { path: "src/acquisition/domain/budget/index.ts", source: "export {};\n" },
          {
            path: "src/acquisition/domain/budget/aggregates/search-budget.ts",
            source: "export const budget = true;\n",
          },
          {
            path: "src/acquisition/domain/budget/adapters/provider.ts",
            source: "export const provider = true;\n",
          },
          {
            path: "src/editorial/domain/news/policies/news-funnel.test.ts",
            source: "export const test = true;\n",
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("keeps the application and infra roots to their agreed entries", () => {
    const violations = checkBoundaries([
      {
        path: "src/acquisition/application/budget-defaults.ts",
        source: "export const defaults = true;\n",
      },
      {
        path: "src/acquisition/application/helpers/budget-defaults.ts",
        source: "export const defaults = true;\n",
      },
      {
        path: "src/acquisition/infra/live.ts",
        source: "export const live = true;\n",
      },
      {
        path: "src/acquisition/infra/wiring/live.ts",
        source: "export const live = true;\n",
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/acquisition/application/budget-defaults.ts application-root",
      "src/acquisition/application/helpers/budget-defaults.ts application-root",
      "src/acquisition/infra/live.ts infra-root",
      "src/acquisition/infra/wiring/live.ts infra-root",
    ]);
  });

  it("accepts ports at the application root and factories under infra", () => {
    expect(
      rulesOf(
        checkBoundaries([
          {
            path: "src/delivery/application/ports.ts",
            source: "export const ports = true;\n",
          },
          {
            path: "src/delivery/application/ports.test.ts",
            source: "export const portsTest = true;\n",
          },
          {
            path: "src/acquisition/infra/factories/live.ts",
            source: "export const live = true;\n",
          },
          {
            path: "src/reading/infra/services/json-record.ts",
            source: "export const record = true;\n",
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("accepts an integration composed from module facades, kernel, and shared code", () => {
    expect(
      rulesOf(
        checkBoundaries([
          {
            path: "src/integrations/glm/search/provider.ts",
            source: [
              'import { Layer } from "effect";',
              'import { readFile } from "node:fs/promises";',
              'import { HttpClient } from "effect/http";',
              'import { SearchProvider } from "../../../acquisition/index.js";',
              'import { canonicalizeUrl } from "../../../kernel/text.js";',
              'import { asRecord } from "../../shared/json-record.js";',
              "export const provider = [Layer, readFile, HttpClient, SearchProvider, canonicalizeUrl, asRecord];",
            ].join("\n"),
          },
          {
            path: "src/integrations/shared/http.ts",
            source: 'import { cheerioLoad } from "cheerio";\nexport const http = cheerioLoad;\n',
          },
          {
            path: "src/app/layers.ts",
            source:
              'import { GlmSearchLive } from "../integrations/glm/index.js";\nexport const live = GlmSearchLive;\n',
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("detects integrations reaching a sibling service, app, or module internals", () => {
    const violations = checkBoundaries([
      {
        path: "src/integrations/doubao/provider.ts",
        source:
          'import { parseGrokStream } from "../grok/search/mapper.js";\nexport const provider = parseGrokStream;\n',
      },
      {
        path: "src/integrations/shared/http.ts",
        source:
          'import { readConduit } from "../github/home-browser.js";\nexport const http = readConduit;\n',
      },
      {
        path: "src/integrations/glm/search/provider.ts",
        source:
          'import { runPluginEffect } from "../../../app/runtime.js";\nexport const provider = runPluginEffect;\n',
      },
      {
        path: "src/integrations/glm/search/provider.ts",
        source:
          'import { parseFeedXml } from "../../../acquisition/domain/item/adapters/rss.js";\nexport const provider = parseFeedXml;\n',
      },
      {
        path: "src/integrations/doubao/provider.ts",
        source: 'import { chromium } from "playwright";\nexport const provider = chromium;\n',
      },
      {
        path: "src/integrations/loose.ts",
        source: "export const loose = true;\n",
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/integrations/doubao/provider.ts integration-isolation",
      "src/integrations/doubao/provider.ts playwright",
      "src/integrations/glm/search/provider.ts deep-import",
      "src/integrations/glm/search/provider.ts integration-dependency",
      "src/integrations/loose.ts integration-root",
      "src/integrations/shared/http.ts shared-isolation",
    ]);
  });

  it("keeps business modules and their entry files off the integrations tree", () => {
    const violations = checkBoundaries([
      {
        path: "src/acquisition/infra/factories/live.ts",
        source:
          'import { RssFeedLive } from "../../../integrations/rss/feed.js";\nexport const live = RssFeedLive;\n',
      },
      {
        path: "src/acquisition/index.ts",
        source:
          'import { DoubaoSearchLive } from "../integrations/doubao/index.js";\nexport const live = DoubaoSearchLive;\n',
      },
      {
        path: "src/editorial/domain/news/policies/rank.ts",
        source:
          'import { grokAudit } from "../../../../integrations/grok/audit.js";\nexport const ranked = grokAudit;\n',
      },
    ]);

    expect(violations.map((violation) => `${violation.file} ${violation.rule}`)).toEqual([
      "src/acquisition/index.ts module-dependency",
      "src/acquisition/infra/factories/live.ts module-dependency",
      "src/editorial/domain/news/policies/rank.ts module-dependency",
      "src/editorial/domain/news/policies/rank.ts source-vocabulary",
    ]);
  });

  it("lets sibling tests reach integrations at file level", () => {
    expect(
      rulesOf(
        checkBoundaries([
          {
            path: "src/integrations/glm/search/provider.test.ts",
            source:
              'import { parseGrokStream } from "../../grok/search/mapper.js";\nexport const suite = parseGrokStream;\n',
          },
          {
            path: "src/editorial/domain/news/policies/rank.test.ts",
            source:
              'import { pageAudit } from "../../../../integrations/grok/audit.js";\nexport const test = pageAudit;\n',
          },
        ]),
      ),
    ).toEqual([]);
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
      path: "src/acquisition/domain/item/value-objects/model.ts",
      source:
        'import { empty } from "../../../../kernel/text.js";\nexport const created = (value: string) => new Date(value);\nexport const label = empty;\n',
    },
    {
      path: "src/acquisition/domain/item/adapters/rss.ts",
      source:
        'import { Schema } from "effect";\nimport { created } from "../value-objects/model.js";\nexport const parsed = [Schema, created];\n',
    },
    {
      path: "src/acquisition/application/use-cases/search.ts",
      source:
        'import { Effect } from "effect";\nimport { created } from "../../domain/item/value-objects/model.js";\nexport const search = [Effect, created];\n',
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
      path: "src/editorial/domain/news/policies/rank.ts",
      source:
        'import type { created } from "../../../../acquisition/domain/item/value-objects/model.js";\nimport { empty } from "../../../../kernel/text.js";\nexport const rank = [empty, created];\n',
    },
    {
      path: "src/app/products/shared/glm-research.ts",
      source:
        'import { GlmSearchClient } from "../../../acquisition/index.js";\nimport { readGlmPage } from "../../../reading/index.js";\nexport const research = [GlmSearchClient, readGlmPage];\n',
    },
    {
      path: "src/app/products/news/flow.ts",
      source:
        'import { search } from "../../../acquisition/index.js";\nimport { empty } from "../../../kernel/index.js";\nimport { createGlmResearch } from "../shared/glm-research.js";\nexport const flow = [search, empty, createGlmResearch];\n',
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
