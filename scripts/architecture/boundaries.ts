/**
 * Dependency rules from docs/plans/0001-ddd-layered-refactor.md section 3.5.
 * Modules are the six top-level directories under src/.
 */

export const modules = [
  "kernel",
  "acquisition",
  "reading",
  "editorial",
  "delivery",
  "app",
] as const;

export type ModuleName = (typeof modules)[number];

/**
 * `src/integrations/` holds the anti-corruption layers for external services
 * (one directory per service plus `shared/`). It is not a business module: it
 * implements the business modules' ports, so the dependency direction is the
 * reverse of a module — integrations may read module facades, never the other
 * way around.
 */
export const integrationsModule = "integrations" as const;

export type AnyModule = ModuleName | typeof integrationsModule;

export type LayerName =
  | "app"
  | "application"
  | "domain"
  | "entry"
  | "infra"
  | "integration"
  | "kernel";

export type ModuleRule = {
  /** Modules this module may import. */
  readonly dependsOn: readonly string[];
  /** Dependencies that may be reached only through `import type`. */
  readonly typesOnly?: readonly string[];
  /** Other modules may be imported only through their `index.ts`. */
  readonly indexOnly?: boolean;
};

export const moduleRules: Readonly<Record<ModuleName, ModuleRule>> = {
  kernel: { dependsOn: [] },
  acquisition: { dependsOn: ["kernel"] },
  reading: { dependsOn: ["kernel"] },
  editorial: { dependsOn: ["kernel", "acquisition", "reading"], typesOnly: ["acquisition", "reading"] },
  delivery: { dependsOn: ["kernel"] },
  app: {
    dependsOn: ["kernel", "acquisition", "reading", "editorial", "delivery", "integrations"],
    indexOnly: true,
  },
};

/**
 * Layers of the same module that a layer may import. There is no adapters
 * layer: translating an external service's format lives in
 * `src/integrations/<service>/`, so a module's domain, application, and infra
 * no longer split that knowledge between themselves.
 */
export const layerDependencies: Readonly<Record<LayerName, readonly LayerName[]>> = {
  domain: ["domain", "kernel"],
  application: ["domain", "application", "kernel"],
  infra: ["domain", "application", "infra", "kernel"],
  app: ["app"],
  kernel: ["kernel"],
  entry: ["domain", "application", "infra", "kernel", "entry"],
  // Integrations live in their own tree; relative imports inside it are judged
  // by the service-isolation rules, not by module layers.
  integration: ["integration"],
};

/**
 * Products under src/app/products/ never import each other (plan section 3.2:
 * composition shared by products is product-agnostic code in `shared/`, which
 * every product may import but which may not import any product back). Files
 * directly under products/ (the registry) are exempt. Sibling tests are exempt
 * along with their layer's other rules.
 */
export const productsRoot = "src/app/products";

export const sharedProductDirectory = "shared";

export const sourceVocabulary = [
  "github",
  "rss",
  "doubao",
  "grok",
  "glm",
  "deepseek",
  "arxiv",
  "x.com",
] as const;

/**
 * Occurrences of the source vocabulary that are part of a locked external
 * surface (CLI messages, JSON field values, persisted identities) rather than
 * hidden service knowledge. Each entry is deliberate: removing the word would
 * change behavior that golden tests or state formats pin down. Everything
 * outside this map stays banned.
 */
export const sourceVocabularyExceptions: Readonly<Record<string, readonly string[]>> = {
  // The feed-catalog rules quote the historical CLI messages ("RSS feed
  // already exists", …) and the feeds.json `type: "rss"` tag; both are the
  // product's own config/output surface, not coupling to the feed service.
  "src/acquisition/domain/source/services/catalog.ts": ["rss"],
  // SourceHealth.kind values ("rss") are part of the run-audit JSON the CLI
  // exposes; the collection use case reports them verbatim.
  "src/acquisition/application/use-cases/collect-sources.ts": ["rss"],
  // The X-account audit's `grok` receipt field and the `grok://cli/v1/`
  // budget identity are locked by the tool's JSON output and the cache keys
  // persisted in news-search.json.
  "src/acquisition/application/use-cases/collect-x-posts.ts": ["grok"],
  // Per-provider budget defaults are keyed by the provider env namespaces;
  // deepseek joins for the fallback's DEEPSEEK_SEARCH_* caps.
  "src/acquisition/application/services/budget-defaults.ts": ["doubao", "grok", "deepseek"],
  // The persisted cache schema names the providers whose pages it can store;
  // the deepseek literal is locked by the cached pages the news fallback
  // writes into news-search.json.
  "src/acquisition/infra/models/news-search.ts": ["doubao", "grok", "deepseek"],
  // The reader fallback chain's "glm" method value and failure message are
  // part of the read-original JSON contract.
  "src/reading/application/use-cases/read-original.ts": ["glm"],
  // Diagnostics records carry the provider receipt field verbatim.
  "src/delivery/application/ports.ts": ["grok"],
};

export const infraPackages = ["cheerio", "fast-xml-parser", "he"] as const;

/** Packages an integration may import besides Effect and `node:*`. */
export const integrationPackages = [
  "cheerio",
  "fast-xml-parser",
  "he",
  "@effect/platform-node",
] as const;

/** The integrations tree's shared technical directory (multi-service reuse). */
export const integrationsSharedDirectory = "shared";

/** Playwright stays behind the one shared browser lifecycle module. */
export const playwrightFiles = ["src/integrations/shared/browser.ts"] as const;

/**
 * Effects are run only at the application runtime boundary; modules express
 * everything as Effect values. Test files are exempt.
 */
export const effectRunFiles = ["src/app/runtime.ts"] as const;

/**
 * DDD building blocks (agent-kit authoring conventions): the only subdirectories
 * a `domain/<concept>/` folder may contain, besides its `index.ts` facade.
 */
export const domainBuildingBlocks = [
  "aggregates",
  "entities",
  "value-objects",
  "policies",
  "factories",
  "errors",
  "events",
  "services",
] as const;

/** The only loose files `application/` may keep at its root (plus their tests). */
export const applicationRootFiles = ["ports.ts", "errors.ts"] as const;

/** The only subdirectories `application/` may contain at its root. */
export const applicationRootDirs = ["use-cases", "services"] as const;

/** The only subdirectories `infra/` may contain at its root. */
export const infraRootDirs = [
  "repository",
  "models",
  "factories",
  "notifier",
  "platform",
] as const;

/** Modules that follow the domain/application/infra layout. */
export const layeredModules = ["acquisition", "reading", "editorial", "delivery"] as const;


