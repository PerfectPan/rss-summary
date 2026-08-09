import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { RunAudit, RunDelivery, StoredRunAudit } from "../domain/run-audit.js";

export type SavedRunArtifact = {
  jsonPath: string;
  markdownPath: string;
};

export function saveRunArtifact(
  root: string,
  audit: RunAudit,
  delivery: RunDelivery,
  markdown: string,
): SavedRunArtifact {
  const day = audit.generatedAt.slice(0, 10);
  const time = audit.generatedAt.slice(11, 19).replaceAll(":", "");
  const base = join(root, day, `${audit.product}-${time}-${audit.runId.slice(0, 8)}`);
  mkdirSync(dirname(base), { recursive: true });
  const jsonPath = `${base}.json`;
  const markdownPath = `${base}.md`;
  const stored: StoredRunAudit = { ...audit, delivery };
  writeFileSync(jsonPath, `${JSON.stringify(stored, null, 2)}\n`);
  writeFileSync(markdownPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  return { jsonPath, markdownPath };
}

export function listRunArtifacts(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .reverse();
}

export function loadRunArtifact(path: string): StoredRunAudit {
  return JSON.parse(readFileSync(path, "utf8")) as StoredRunAudit;
}

export function runArtifactLabel(path: string): string {
  return basename(path, ".json");
}
