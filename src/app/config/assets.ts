import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve a file shipped at the package root (industry-feeds.json,
 * news-topics.json). Walking up to the nearest package.json keeps the path
 * stable whether this module runs from src/ or from the packed dist/ tree,
 * instead of depending on the source file's directory depth.
 */
export function packageAsset(name: string): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(join(directory, "package.json"))) return join(directory, name);
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`Unable to locate the package root for ${name}.`);
    }
    directory = parent;
  }
}

export const defaultIndustrySourcesFile = (): string => packageAsset("industry-feeds.json");

export const defaultNewsTopicsFile = (): string => packageAsset("news-topics.json");
