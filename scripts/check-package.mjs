import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "rss-summary-package-"));

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", root], repository));
  const archive = join(root, packed[0].filename);
  const consumer = join(root, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", archive, "@rivus/agent@0.1.1"],
    consumer,
  );

  const installed = join(consumer, "node_modules", "rss-summary");
  requireFile(join(installed, "dist", "rivus-plugin.d.ts"));
  requireFile(join(installed, "docs", "rivus-plugin.md"));
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import plugin from "rss-summary/rivus-plugin";
import { assertRivusPluginConforms } from "@rivus/agent/testing";
const report = await assertRivusPluginConforms({
  deployment: {
    agentId: "rss-digest",
    endpointIds: [],
    pluginId: "rss-summary",
    profileId: "rss-digest",
    skills: { allow: [] },
    tools: { allow: ["rss-summary/generate-digest"] }
  },
  plugin
});
if (report.pluginId !== "rss-summary") throw new Error("Unexpected Plugin conformance report");`,
    ],
    consumer,
  );

  console.log("check-package: ok (rss-summary/rivus-plugin)");
} finally {
  await rm(root, { force: true, recursive: true });
}

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`Packed package is missing ${path}`);
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8" });
  } catch (error) {
    if (error?.stdout) process.stdout.write(error.stdout);
    if (error?.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}
