/**
 * Enforces the test layout mirror:
 *   src/<layer>/<name>.ts  →  tests/<layer>/<name>.test.ts
 *
 * Repo-level harness tests live under tests/repo/.
 * A small allowlist covers pure re-export or entrypoint-only modules.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Modules intentionally covered via sibling tests rather than a 1:1 file. */
const coveredBySibling = new Map([
  // feed list contract tests sit next to the env config; no module under
  // src/app/config/feed-config.ts
  ["app/config/feed-config", "app/config/env and the acquisition catalog tests"],
  // Tool metadata (ids, digests, editorial policy strings) is locked verbatim by
  // the golden registration snapshot and the phase executor tests.
  ["app/products/daily-ai/tool", "golden registration snapshot and app/rivus/phases tests"],
  // Legacy argv+env loader kept until the product flows move; its behavior is
  // asserted by the app/config tests that replace it.
  ["infrastructure/config", "app/config/env and app/config/argv"],
  // Pure re-exports. Their behavior is covered by the kernel tests.
  ["domain/time", "kernel/time"],
  ["domain/text", "kernel/text"],
  ["kernel/index", "kernel/result, kernel/time, and kernel/text"],
  // Pure re-export shims kept for tests/golden imports; behavior lives in delivery.
  ["infrastructure/state", "delivery/domain/ledger and delivery/infra/repository/feed-state-file"],
  ["infrastructure/run-store", "delivery/infra/repository/run-archive-files"],
  ["infrastructure/daily-ai-diagnostics", "delivery/infra/repository/diagnostics-file"],
  // Declaration-only or assembly modules inside delivery.
  ["delivery/index", "delivery use-case and repository tests"],
  ["editorial/index", "editorial domain tests"],
  ["delivery/application/ports", "delivery use-case tests"],
  ["delivery/infra/models/feed-state", "delivery/infra/repository/feed-state-file"],
]);

/** Layers that must mirror 1:1 with tests/<layer>/<name>.test.ts */
const layers = [
  "domain",
  "application",
  "infrastructure",
  "presentation",
  "kernel",
  "app",
  "reading",
  "delivery",
  "acquisition",
  "editorial",
];

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

const missing = [];
const extra = [];

for (const layer of layers) {
  const srcDir = join(root, "src", layer);
  const testDir = join(root, "tests", layer);
  const srcFiles = listTs(srcDir).map((p) => relative(srcDir, p).replace(/\.ts$/u, ""));
  const testFiles = new Set(
    listTs(testDir)
      .map((p) => relative(testDir, p))
      .filter((p) => p.endsWith(".test.ts"))
      .map((p) => p.replace(/\.test\.ts$/u, "")),
  );

  for (const name of srcFiles) {
    if (coveredBySibling.has(`${layer}/${name}`)) continue;
    if (!testFiles.has(name)) missing.push(`src/${layer}/${name}.ts → tests/${layer}/${name}.test.ts`);
  }

  for (const name of testFiles) {
    const srcPath = join(srcDir, `${name}.ts`);
    try {
      statSync(srcPath);
    } catch {
      // allow tests that only exercise a related config surface
      if (name === "config/feed-config" && layer === "app") continue;
      extra.push(`tests/${layer}/${name}.test.ts (no src/${layer}/${name}.ts)`);
    }
  }
}

// Repo harness must exist
const repoTests = listTs(join(root, "tests", "repo")).filter((p) => p.endsWith(".test.ts"));
if (repoTests.length === 0) missing.push("tests/repo/*.test.ts (repo harness missing)");

if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0) {
    console.error("check-test-layout: missing mirrored tests:");
    for (const line of missing) console.error(`  - ${line}`);
  }
  if (extra.length > 0) {
    console.error("check-test-layout: unexpected test files:");
    for (const line of extra) console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log(
  `check-test-layout: ok (${layers.join("/")} mirrored; ${repoTests.length} repo harness files)`,
);
