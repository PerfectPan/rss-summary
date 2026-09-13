import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const configuredCoreArchive = process.env.RIVUS_CORE_PACKAGE_TGZ?.trim();
const configuredCoreSha256 = process.env.RIVUS_CORE_PACKAGE_SHA256?.trim().toLowerCase();
const configuredCoreVersion = process.env.RIVUS_CORE_PACKAGE_VERSION?.trim();
if (configuredCoreVersion && (!/^\d+\.\d+\.\d+$/.test(configuredCoreVersion) || configuredCoreArchive)) {
  throw new Error("RIVUS_CORE_PACKAGE_VERSION must be an exact release version and cannot be combined with an archive");
}
const coreSpec = configuredCoreArchive
  ? resolve(configuredCoreArchive)
  : `@rivus/agent@${configuredCoreVersion ?? "0.12.7"}`;

if (configuredCoreArchive) {
  if (!configuredCoreSha256 || !/^[0-9a-f]{64}$/.test(configuredCoreSha256)) {
    throw new Error("RIVUS_CORE_PACKAGE_SHA256 must be a 64-character lowercase SHA256 when an archive is configured");
  }
  requireFile(coreSpec);
  const actual = createHash("sha256").update(readFileSync(coreSpec)).digest("hex");
  if (actual !== configuredCoreSha256) {
    throw new Error(
      `RIVUS_CORE_PACKAGE_TGZ SHA256 mismatch: expected ${configuredCoreSha256}, received ${actual}`,
    );
  }
}

const root = await mkdtemp(join(tmpdir(), "rss-summary-package-"));

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", root], repository));
  const archive = join(root, packed[0].filename);
  const consumer = join(root, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--registry=https://registry.npmjs.org",
      archive,
      coreSpec,
    ],
    consumer,
  );

  const installed = join(consumer, "node_modules", "rss-summary");
  requireFile(join(installed, "dist", "presentation", "rivus-plugin.d.ts"));
  requireFile(join(installed, "docs", "rivus-plugin.md"));
  requireFile(join(installed, "industry-feeds.json"));
  requireFile(join(installed, "news-topics.json"));
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import plugin from "rss-summary/rivus-plugin";
import { assertRivusPluginConforms } from "@rivus/agent/testing";
createRequire(import.meta.url).resolve("rss-summary/rivus-plugin");
const installed = ${JSON.stringify(installed)};
const { loadConfig } = await import(
  pathToFileURL(join(installed, "dist", "infrastructure", "config.js")).href
);
const config = loadConfig({}, ["--dry-run"]);
const expectedIndustrySourceCount = JSON.parse(
  readFileSync(join(installed, "industry-feeds.json"), "utf8")
).length;
if (config.industrySources.length !== expectedIndustrySourceCount) {
  throw new Error(
    "Packaged industry sources: expected " + expectedIndustrySourceCount +
      ", received " + config.industrySources.length
  );
}
const report = await assertRivusPluginConforms({
  deployment: {
    agentId: "rss-digest",
    endpointIds: [],
    pluginId: "rss-summary",
    profileId: "rss-digest",
    skills: { allow: [] },
    tools: { allow: ["rss-summary/generate-digest", "rss-summary/research-article", "rss-summary/generate-daily-ai-digest", "rss-summary/generate-news-brief", "rss-summary/generate-industry-brief"] }
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
