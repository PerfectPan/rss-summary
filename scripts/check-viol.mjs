import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkBoundaries } from "./architecture/check.js";
const root = new URL("..", import.meta.url).pathname;
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) files.push(p);
  }
}
walk(join(root, "src"));
const inputs = files.map((p) => ({ path: relative(root, p), source: readFileSync(p, "utf8") }));
const violations = checkBoundaries(inputs);
console.log(`TOTAL: ${violations.length}`);
for (const v of violations) console.log(`${v.file}: ${v.rule}: ${v.message}`);
