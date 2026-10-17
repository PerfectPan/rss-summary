/**
 * Dependency rules from docs/plans/0001-ddd-layered-refactor.md section 3.5.
 * The planned module directories do not exist yet. The checker still classifies today's
 * src/domain, src/application, src/infrastructure, and src/presentation tree as one legacy
 * module so the current violations can be reported.
 */

export const modules = [
  "kernel",
  "acquisition",
  "reading",
  "editorial",
  "delivery",
  "app",
] as const;

export type ModuleName = (typeof modules)[number] | "legacy";

export type LayerName =
  | "adapters"
  | "app"
  | "application"
  | "domain"
  | "entry"
  | "infra"
  | "kernel";

export type ModuleRule = {
  /** Modules this module may import. */
  readonly dependsOn: readonly string[];
  /** Dependencies that may be reached only through `import type`. */
  readonly typesOnly?: readonly string[];
  /** Other modules may be imported only through their `index.ts`. */
  readonly indexOnly?: boolean;
};

export const moduleRules: Readonly<Record<Exclude<ModuleName, "legacy">, ModuleRule>> = {
  kernel: { dependsOn: [] },
  acquisition: { dependsOn: ["kernel"] },
  reading: { dependsOn: ["kernel"] },
  editorial: { dependsOn: ["kernel", "acquisition", "reading"], typesOnly: ["acquisition", "reading"] },
  delivery: { dependsOn: ["kernel"] },
  app: {
    dependsOn: ["kernel", "acquisition", "reading", "editorial", "delivery"],
    indexOnly: true,
  },
};

/** Layers of the same module that a layer may import. */
export const layerDependencies: Readonly<Record<LayerName, readonly LayerName[]>> = {
  domain: ["domain", "kernel"],
  adapters: ["domain", "adapters", "kernel"],
  application: ["domain", "adapters", "application", "kernel"],
  // Infra calls domain adapters to turn a fetched document into the port's
  // historical value. The plan's dependency table omits this edge.
  infra: ["domain", "adapters", "application", "infra", "kernel"],
  app: ["app"],
  kernel: ["kernel"],
  entry: ["domain", "adapters", "application", "infra", "kernel", "entry"],
};

export const sourceVocabulary = ["github", "rss", "doubao", "grok", "glm", "arxiv", "x.com"] as const;

export const adapterPackages = ["cheerio", "fast-xml-parser", "he"] as const;

export const infraPackages = ["cheerio", "fast-xml-parser", "he", "lodash-es", "playwright"] as const;

/** Playwright stays behind the two browser adapters named in section 3.5. */
export const playwrightFiles = [
  "src/acquisition/infra/adapters/browser.ts",
  "src/reading/infra/adapters/browser-reader.ts",
] as const;

export const legacyLayer: Readonly<Record<string, LayerName>> = {
  application: "application",
  domain: "domain",
  infrastructure: "infra",
  presentation: "app",
};
