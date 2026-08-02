/**
 * Enforces the test layout mirror:
 *   src/<layer>/<name>.ts  →  tests/<layer>/<name>.test.ts
 *
 * Repo-level harness tests live under tests/repo/.
 * A small allowlist covers pure re-export or entrypoint-only modules.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Modules intentionally covered via sibling tests rather than a 1:1 file. */
const coveredBySibling = new Map([
  // feed list contract tests sit next to config; still under infrastructure/
  // (no module under src/feed-config.ts)
]);

/** Layers that must mirror 1:1 with tests/<layer>/<name>.test.ts */
const layers = ["domain", "application", "infrastructure", "presentation"];

function listTs(dir) {
  const out = [];
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
      if (name === "feed-config" && layer === "infrastructure") continue;
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
