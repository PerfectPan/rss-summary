/**
 * Enforces the sibling-test layout:
 *   src/<module>/<path>/<name>.ts  →  src/<module>/<path>/<name>.test.ts
 *
 * Unit tests live next to the source file they exercise. Package-level and
 * cross-module tests stay under tests/ (fixtures, golden, repo, support).
 *
 * Two source shapes are exempt automatically because a sibling test would
 * only restate the exports:
 *   - pure re-export modules (barrel files);
 *   - type-only modules (no runtime behavior).
 * Anything else without a sibling test must be listed in `coveredElsewhere`
 * with the reason.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Sources whose behavior is covered by tests that are not their sibling. */
const coveredElsewhere = new Map([
  // Tool metadata (ids, digests, inputSchema) and the automation prompts are
  // locked verbatim by the golden registration snapshot; executors run in the
  // product flow and phase tests.
  ["app/products/daily-ai/tool", "golden registration snapshot"],
  ["app/products/news/tool", "golden news tool tests and app/products/news/flow tests"],
  ["app/products/daily-ai/automation", "golden registration snapshot"],
  ["app/products/frontier/automation", "golden registration snapshot"],
  ["app/products/news/automation", "golden registration snapshot"],
  ["app/products/subscriptions/automation", "golden registration snapshot"],
  // The cross-product Tool id is locked verbatim by the golden registration
  // snapshot; consumers reference it through products/shared.
  ["app/products/shared/tool-ids", "golden registration snapshot"],
  // Thin bind of editorial's decideCandidate to the acquisition identity; the
  // binding is exercised end to end by both of its callers' flow tests.
  [
    "app/products/shared/candidate-decision",
    "subscriptions flow tests and shared industry tests",
  ],
  // The CLI command runs the flow end to end (config → collect → deliver).
  ["app/products/frontier/flow", "app/products/frontier/cli tests"],
  // The product registry is iterated by the Rivus plugin registration and the
  // CLI dispatch tests.
  ["app/products/index", "app/rivus/plugin tests and app/cli dispatch tests"],
  // Module entry besides the re-exports: only the DeliveryLive assembly,
  // exercised wherever the delivery ports are provided.
  ["delivery/index", "delivery use-case and repository tests"],
  // Port declarations (Context.Service classes) have no behavior of their own;
  // use cases exercise them through substitute layers.
  ["delivery/application/ports", "delivery use-case tests"],
  // Storage schema round-trips are covered by the repository writing them.
  ["delivery/infra/models/feed-state", "delivery/infra/repository/feed-state-file tests"],
  // Cache-key derivation is exercised wherever entries are keyed: the budget
  // aggregate restore tests and the search-budget repository tests.
  [
    "acquisition/domain/budget/value-objects/budget",
    "budget aggregate tests and search-budget-file repository tests",
  ],
  // usageFor runs inside the aggregate's usage(); its invalid monthly total is
  // asserted by the budget aggregate tests.
  [
    "acquisition/domain/budget/services/budget-state",
    "budget aggregate tests: usage reads the counters, the invalid monthly total throws",
  ],
  // The audit projection is applied by the Rivus subscription phases, which
  // assert the editorialSelection audit it writes.
  [
    "editorial/domain/subscription/services/editorial-audit",
    "app/rivus/phases tests",
  ],
  // Hits are projected inside the news flow and hybrid retrieval paths.
  ["editorial/domain/news/factories/news-hit", "news flow and hybrid tests"],
  // The Doubao mapper's tier table is asserted by the dto tests alongside the
  // parsed page it produces.
  [
    "integrations/doubao/mapper",
    "integrations/doubao/dto tests assert the mapped credibility tiers",
  ],
  // The Grok layers are thin binds: the Live layers wrap the CLI clients the
  // cli tests exercise directly, and the shared provider suite runs them.
  [
    "integrations/grok/provider",
    "integrations/grok/cli tests and the shared search-provider suite",
  ],
  // The Grok request schema and native-receipt predicates run inside the CLI
  // transport and the stream mapper both.
  [
    "integrations/grok/search/dto",
    "integrations/grok/cli tests and search mapper tests",
  ],
  // The GLM MCP transport runs behind both the search and reader suites; its
  // handshake, SSE parsing, and size limits are asserted end to end there.
  ["integrations/glm/mcp-client", "integrations/glm research, provider, and reader tests"],
  // The webReader payload decode and page projection run inside readGlmPage,
  // asserted by the reader and research tests (dates, truncation, origin).
  ["integrations/glm/reader/dto", "integrations/glm reader and research tests"],
  ["integrations/glm/reader/mapper", "integrations/glm reader and research tests"],
  // The search result-list shape is exercised by the mapper tests.
  ["integrations/glm/search/dto", "integrations/glm search mapper tests"],
  // The browser lifecycle runs behind the GitHub Home flows and the article
  // browser reader, both of which drive it end to end with substitutes.
  [
    "integrations/shared/browser",
    "integrations/github home-browser tests and integrations/browser reader tests",
  ],
  // The remaining thin binds and secondary halves of split adapter files run
  // inside the suites named beside them.
  [
    "acquisition/infra/factories/live",
    "app/layers AcquisitionLive tests and the source-catalog repository tests",
  ],
  [
    "integrations/github/activity",
    "app/layers AcquisitionLive tests (missing storage state) and conduit tests",
  ],
  ["integrations/github/catalog", "integrations/github client tests"],
  [
    "integrations/github/event/mapper",
    "integrations/github event dto tests and app/layers AcquisitionLive tests",
  ],
  [
    "integrations/github/home/dto",
    "integrations/github home mapper and home-browser tests",
  ],
  [
    "integrations/github/repository/dto",
    "integrations/github repository mapper tests and client tests",
  ],
  ["integrations/rss/dto", "integrations/rss mapper tests parse through it"],
  ["integrations/rss/feed", "app/layers AcquisitionLive tests and rss client tests"],
  ["integrations/web-page/dto", "integrations/web-page mapper tests extract through it"],
  ["integrations/web-page/feed", "app/layers AcquisitionLive tests and web-page client tests"],
  // Categories and title cleaning run in the Daily AI flow; the category enum
  // is also locked verbatim by the golden registration snapshot.
  [
    "editorial/domain/daily-ai/value-objects/daily-ai",
    "daily-ai flow tests and the golden registration snapshot",
  ],
]);

/** Directories allowed under tests/. */
const testTreeAllowlist = ["fixtures", "golden", "repo", "support"];

function listTs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "");
}

/** Only `export { … } from "…"` / `export * from "…"` statements, no imports. */
function isPureReExport(source) {
  const stripped = stripComments(source);
  if (/^import /mu.test(stripped)) return false;
  const exports = stripped.match(/^export .*$/gmu) ?? [];
  if (exports.length === 0) return false;
  return exports.every((line) => /^export (type )?(\{|\*)/u.test(line));
}

/** Only `export type` declarations; there is no runtime import or export. */
function isTypeOnly(source) {
  const stripped = stripComments(source);
  if (/^import (?!type\b)/mu.test(stripped)) return false;
  if (/^export (?!type\b|interface\b)/mu.test(stripped)) return false;
  return /^export (type|interface)/mu.test(stripped);
}

const srcDir = join(root, "src");
const missing = [];
const unexpected = [];

for (const file of listTs(srcDir)) {
  if (file.endsWith(".test.ts")) continue;
  const rel = relative(srcDir, file).replace(/\.ts$/u, "");
  if (coveredElsewhere.has(rel)) continue;
  const source = readFileSync(file, "utf8");
  if (isPureReExport(source) || isTypeOnly(source)) continue;
  if (!existsSync(file.replace(/\.ts$/u, ".test.ts"))) {
    missing.push(`src/${rel}.ts → src/${rel}.test.ts`);
  }
}

// tests/ keeps only package-level and cross-module trees.
for (const name of readdirSync(join(root, "tests"))) {
  const full = join(root, "tests", name);
  if (!statSync(full).isDirectory()) continue;
  if (!testTreeAllowlist.includes(name)) unexpected.push(`tests/${name}/ (not in allowlist)`);
}

// Repo harness must exist
const repoTests = listTs(join(root, "tests", "repo")).filter((p) => p.endsWith(".test.ts"));
if (repoTests.length === 0) missing.push("tests/repo/*.test.ts (repo harness missing)");

if (missing.length > 0 || unexpected.length > 0) {
  if (missing.length > 0) {
    console.error("check-test-layout: missing sibling tests:");
    for (const line of missing) console.error(`  - ${line}`);
  }
  if (unexpected.length > 0) {
    console.error("check-test-layout: unexpected directories under tests/:");
    for (const line of unexpected) console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log(
  `check-test-layout: ok (sibling tests for src; tests/${testTreeAllowlist.join("/")} preserved; ${repoTests.length} repo harness files)`,
);
