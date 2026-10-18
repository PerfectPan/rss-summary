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
