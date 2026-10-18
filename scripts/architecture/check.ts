import { isBuiltin } from "node:module";
import { posix } from "node:path";

import ts from "typescript";

import {
  applicationRootDirs,
  applicationRootFiles,
  domainBuildingBlocks,
  effectRunFiles,
  infraPackages,
  infraRootDirs,
  integrationsModule,
  integrationsSharedDirectory,
  type AnyModule,
  integrationPackages,
  layeredModules,
  layerDependencies,
  type LayerName,
  type ModuleName,
  moduleRules,
  modules,
  playwrightFiles,
  productsRoot,
  sharedProductDirectory,
  sourceVocabulary,
  sourceVocabularyExceptions,
} from "./boundaries.js";

export type SourceInput = {
  path: string;
  source: string;
};

export type Violation = {
  file: string;
  message: string;
  rule: string;
};

type ImportName = {
  name: string;
  typeOnly: boolean;
};

type ImportRef = {
  names: ImportName[];
  specifier: string;
  typeOnly: boolean;
};

type Location = {
  layer: LayerName;
  module: AnyModule;
  test: boolean;
};

const planned = new Set<string>([...modules, integrationsModule]);
const sourceWord = new RegExp(`\\b(?:${sourceVocabulary.map(escapeRegExp).join("|")})\\b`, "giu");

export function checkBoundaries(files: readonly SourceInput[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    violations.push(...checkStructure(file.path));
    const location = locate(file.path);
    if (!location) continue;
    violations.push(...checkImports(file, location), ...checkText(file, location));
  }
  return violations.sort((left, right) =>
    `${left.file}\0${left.rule}\0${left.message}`.localeCompare(
      `${right.file}\0${right.rule}\0${right.message}`,
    ),
  );
}


/**
 * Layout rules from the agent-kit conventions: a `domain/<concept>/` folder
 * holds only its building-block subdirectories and the `index.ts` facade
 * (loose `*.test.ts` siblings excepted); `application/` keeps only `ports.ts`
 * and `errors.ts` beside its agreed subdirectories; `infra/` keeps no loose
 * files at its root.
 */
function checkStructure(path: string): Violation[] {
  const parts = path.replace(/\\/gu, "/").split("/");
  if (parts[0] !== "src" || parts.length < 3) return [];
  const [head, module, layer] = parts;
  if (head !== "src") return [];
  if (module === integrationsModule) {
    if (parts.length === 3) {
      return [
        violation(
          path,
          "integration-root",
          "src/integrations/ keeps only service directories (plus shared/); no loose files",
        ),
      ];
    }
    return [];
  }
  if (!(layeredModules as readonly string[]).includes(module)) return [];
  const rest = parts.slice(3);
  if (layer === "domain") {
    const [concept, child] = rest;
    if (!concept || rest.length < 2) return [];
    if (rest.length === 2) {
      const allowed = child === "index.ts" || child?.endsWith(".test.ts");
      if (!allowed) {
        return [
          violation(
            path,
            "concept-structure",
            `domain/${concept}/ may contain only building-block directories and index.ts (plus sibling tests)`,
          ),
        ];
      }
      return [];
    }
    if (!(domainBuildingBlocks as readonly string[]).includes(child!)) {
      return [
        violation(
          path,
          "concept-structure",
          `domain/${concept}/${child} is not a DDD building block (${domainBuildingBlocks.join(", ")})`,
        ),
      ];
    }
    return [];
  }
  if (layer === "application") {
    if (rest.length === 1) {
      const allowed = (applicationRootFiles as readonly string[]).some(
        (name) => rest[0] === name || rest[0] === name.replace(/\.ts$/u, ".test.ts"),
      );
      if (!allowed) {
        return [
          violation(
            path,
            "application-root",
            `application/ may keep only ${applicationRootFiles.join(", ")} at its root`,
          ),
        ];
      }
      return [];
    }
    if (!(applicationRootDirs as readonly string[]).includes(rest[0]!)) {
      return [
        violation(
          path,
          "application-root",
          `application/${rest[0]} is not an agreed application directory (${applicationRootDirs.join(", ")})`,
        ),
      ];
    }
    return [];
  }
  if (layer === "infra") {
    if (rest.length === 1) {
      return [violation(path, "infra-root", "infra/ may not keep loose files at its root")];
    }
    if (!(infraRootDirs as readonly string[]).includes(rest[0]!)) {
      return [
        violation(
          path,
          "infra-root",
          `infra/${rest[0]} is not an agreed infra directory (${infraRootDirs.join(", ")})`,
        ),
      ];
    }
    return [];
  }
  return [];
}

function checkImports(file: SourceInput, location: Location): Violation[] {
  if (location.test) return checkTestImports(file, location);
  const violations: Violation[] = [];
  for (const ref of readImports(file)) {
    if (ref.specifier.startsWith(".")) {
      violations.push(...checkRelative(file.path, location, ref));
      continue;
    }
    if (isNode(ref.specifier)) {
      if (!nodeAllowed(location.layer)) {
        violations.push(violation(file.path, "node-builtin", `${location.layer}/ may not import ${ref.specifier}`));
      }
      continue;
    }
    if (isEffect(ref.specifier)) {
      violations.push(...checkEffect(file.path, location.layer, ref));
      continue;
    }
    violations.push(...checkPackage(file.path, location, ref));
  }
  return violations;
}

/**
 * Integrations are driven adapters: they implement the business modules' ports,
 * so they may read module facades and kernel, share technical code through
 * `integrations/shared/`, and never reach into app or a sibling service.
 */
function checkIntegrationRelative(file: string, targetPath: string): Violation[] {
  const self = integrationService(file);
  if (targetPath.startsWith(`${integrationsPath}/`)) {
    const targetService = targetPath.slice(integrationsPath.length + 1).split("/")[0]!;
    if (targetService === self) return [];
    if (self !== integrationsSharedDirectory && targetService === integrationsSharedDirectory) {
      return [];
    }
    if (self === integrationsSharedDirectory) {
      return [
        violation(
          file,
          "shared-isolation",
          `integrations/shared/ may not import the ${targetService} service`,
        ),
      ];
    }
    return [
      violation(
        file,
        "integration-isolation",
        `integrations/${self} may not import integrations/${targetService}; shared code goes in integrations/shared/`,
      ),
    ];
  }
  const target = locate(targetPath);
  if (!target) {
    return [violation(file, "relative-escape", `${targetPath} does not resolve inside a module`)];
  }
  if (target.module === "app" || target.module === integrationsModule) {
    return [
      violation(file, "integration-dependency", `integrations may not import ${target.module}`),
    ];
  }
  if (target.module !== "kernel" && !isModuleIndex(targetPath)) {
    return [
      violation(
        file,
        "deep-import",
        `integrations may import ${target.module} only through index.ts`,
      ),
    ];
  }
  return [];
}

const integrationsPath = "src/integrations";

/** The integration directory a file belongs to (`shared` or a service name). */
function integrationService(file: string): string {
  return file.slice(integrationsPath.length + 1).split("/")[0]!;
}

/**
 * Sibling tests (`*.test.ts`) are exempt from their layer's dependency rules —
 * they may use `node:*`, Effect, and substitute layers — but they may not reach
 * into another module's internals: cross-module imports go through the module's
 * `index.ts` (any direction, because tests legitimately verify combinations of
 * modules). Shared suites under `tests/support/` are the only files outside
 * `src/` they may import.
 */
function checkTestImports(file: SourceInput, location: Location): Violation[] {
  const violations: Violation[] = [];
  for (const ref of readImports(file)) {
    if (!ref.specifier.startsWith(".")) continue;
    const resolved = resolveRelative(file.path, ref.specifier);
    // `..` segments that walk out of src/ land at the repository root in this
    // layout; posix.normalize keeps them as a leading "../" run.
    const targetPath = stripRootEscape(resolved);
    if (targetPath !== undefined && targetPath.startsWith("tests/support/")) continue;
    const target = targetPath === undefined ? undefined : locate(targetPath);
    if (!target) {
      violations.push(violation(file.path, "relative-escape", `${ref.specifier} leaves src/`));
      continue;
    }
    // Integrations are test-visible at file level: sibling tests substitute
    // transports and assert against mapper output, and business-module tests
    // verify combinations against the same anti-corruption layer the app uses.
    if (target.module === integrationsModule) continue;
    if (target.module === location.module) continue;
    if (!isModuleIndex(targetPath!)) {
      violations.push(
        violation(
          file.path,
          "deep-import",
          `tests may import ${target.module} only through index.ts`,
        ),
      );
    }
  }
  return violations;
}

/** Drop leading "../" run when it exactly reaches the repository root. */
function stripRootEscape(path: string): string | undefined {
  let current = path;
  while (current.startsWith("../")) current = current.slice(3);
  return current.startsWith("..") ? undefined : current;
}

function checkRelative(file: string, location: Location, ref: ImportRef): Violation[] {
  const targetPath = resolveRelative(file, ref.specifier);
  if (!targetPath.startsWith("src/")) {
    return [violation(file, "relative-escape", `${ref.specifier} leaves src/`)];
  }
  if (location.layer === "integration") {
    return checkIntegrationRelative(file, targetPath);
  }
  const target = locate(targetPath);
  if (!target) {
    return [violation(file, "relative-escape", `${ref.specifier} does not resolve inside a module`)];
  }
  const productViolations = checkProductIsolation(file, targetPath);
  if (productViolations.length > 0) return productViolations;
  if (target.module !== location.module) return checkCrossModule(file, location, target, targetPath, ref);
  if (!layerDependencies[location.layer].includes(target.layer)) {
    return [violation(file, "layer", `${location.layer}/ may not import ${target.layer}/`)];
  }
  return [];
}

/**
 * `src/app/products/<a>/` may not import `src/app/products/<b>/`: products are
 * isolated from each other and compose through `products/shared/`, which every
 * product may import but which must stay product-agnostic itself. Files
 * directly under products/ (the registry) are not a product. Test files reach
 * this only through checkRelative's non-test caller, so sibling tests keep
 * their exemption.
 */
function checkProductIsolation(file: string, targetPath: string): Violation[] {
  const source = productDirectory(file);
  const target = productDirectory(targetPath);
  if (!source || !target || source === target) return [];
  if (target === sharedProductDirectory && source !== sharedProductDirectory) return [];
  return [
    violation(
      file,
      "product-boundary",
      `products/${source} may not import products/${target}; shared composition goes in products/${sharedProductDirectory}/`,
    ),
  ];
}

/** The product subdirectory a path lives in, if any (`shared` counts as one). */
function productDirectory(path: string): string | undefined {
  const prefix = `${productsRoot}/`;
  if (!path.startsWith(prefix)) return undefined;
  const rest = path.slice(prefix.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? undefined : rest.slice(0, slash);
}

function checkCrossModule(
  file: string,
  source: Location,
  target: Location,
  targetPath: string,
  ref: ImportRef,
): Violation[] {
  // Integrations resolve their relative imports through the service-isolation
  // rules before this generic module path runs.
  const rule = moduleRules[source.module as ModuleName];
  if (!rule.dependsOn.includes(target.module)) {
    return [
      violation(
        file,
        "module-dependency",
        `${source.module} may not import ${target.module}`,
      ),
    ];
  }
  if (rule.typesOnly?.includes(target.module) && !ref.typeOnly) {
    return [
      violation(file, "types-only", `${source.module} may import ${target.module} only with import type`),
    ];
  }
  // app composes integrations directly (app/layers.ts and the product files
  // that genuinely need a service); the index-only rule stays for modules.
  if (target.module === integrationsModule && source.module === "app") return [];
  if ((rule.indexOnly || source.layer === "app") && !isModuleIndex(targetPath)) {
    return [violation(file, "deep-import", `${source.module} may import ${target.module} only through index.ts`)];
  }
  return [];
}

function checkEffect(file: string, layer: LayerName, ref: ImportRef): Violation[] {
  if (
    layer === "application" ||
    layer === "infra" ||
    layer === "app" ||
    layer === "entry" ||
    layer === "integration"
  ) {
    return [];
  }
  return [violation(file, "effect", `${layer}/ may not import ${ref.specifier}`)];
}

function checkPackage(file: string, location: Location, ref: ImportRef): Violation[] {
  const name = packageName(ref.specifier);
  if (name === "@rivus/agent" || name.startsWith("@rivus/agent/")) {
    return location.layer === "app" || location.layer === "entry"
      ? []
      : [violation(file, "external", `${location.layer}/ may not import ${name}`)];
  }
  if (name === "playwright") {
    return (playwrightFiles as readonly string[]).includes(file)
      ? []
      : [violation(file, "playwright", "playwright is only allowed in the browser modules")];
  }
  const allowed: readonly string[] =
    location.layer === "infra"
      ? infraPackages
      : location.layer === "integration"
        ? integrationPackages
        : [];
  if (allowed.includes(name)) return [];
  return [violation(file, "external", `${location.layer}/ may not import ${name}`)];
}

function checkText(file: SourceInput, location: Location): Violation[] {
  const violations: Violation[] = [];
  if (!location.test && /\bEffect\.run\w*\(/u.test(file.source)) {
    const allowed = (effectRunFiles as readonly string[]).includes(file.path);
    if (!allowed) {
      violations.push(
        violation(
          file.path,
          "effect-run",
          "Effect.run* may only be called in src/app/runtime.ts (test files excepted)",
        ),
      );
    }
  }
  if (location.test) return violations;
  // Business modules may not name a provider in domain, application, infra, or
  // their entry facade: naming a service means depending on it, and the place
  // for that knowledge is src/integrations/. `integrations/` and `app/` are
  // exempt, and the package's own "rss-summary" name never counts.
  const vocabularyChecked =
    location.module !== "kernel" &&
    (location.layer === "domain" ||
      location.layer === "application" ||
      location.layer === "infra" ||
      location.layer === "entry");
  if (vocabularyChecked) {
    const words = [
      ...new Set(
        (file.source.replace(/rss-summary/gu, "").match(sourceWord) ?? []).map((word) =>
          word.toLowerCase(),
        ),
      ),
    ]
      .filter((word) => !(sourceVocabularyExceptions[file.path] ?? []).includes(word))
      .sort();
    if (words.length > 0) {
      violations.push(violation(file.path, "source-vocabulary", `concept directory contains ${words.join(", ")}`));
    }
    if (location.layer === "domain" && hasBareClock(file)) {
      violations.push(violation(file.path, "clock", "concept directory calls Date.now() or new Date() without arguments"));
    }
  }
  if (location.layer === "application") {
    if (/\bprocess\.env\b/u.test(file.source)) {
      violations.push(violation(file.path, "process-env", "application/ may not read process.env"));
    }
    if (/\bconsole\.(?:debug|error|info|log|warn)\b/u.test(file.source)) {
      violations.push(violation(file.path, "console", "application/ may not call console"));
    }
  }
  return violations;
}

function hasBareClock(file: SourceInput): boolean {
  const sourceFile = parse(file);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isNewExpression(node) && node.expression.kind === ts.SyntaxKind.Identifier) {
      const name = node.expression.getText(sourceFile);
      if (name === "Date" && (node.arguments?.length ?? 0) === 0) found = true;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === "Date" &&
      node.expression.name.text === "now"
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function readImports(file: SourceInput): ImportRef[] {
  const sourceFile = parse(file);
  const imports: ImportRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = moduleSpecifier(node);
      if (specifier) imports.push(importRef(node, specifier));
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        imports.push({ names: [], specifier: argument.text, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function importRef(node: ts.ImportDeclaration | ts.ExportDeclaration, specifier: string): ImportRef {
  const names = importNames(node);
  const clauseTypeOnly = ts.isImportDeclaration(node)
    ? node.importClause?.isTypeOnly === true
    : node.isTypeOnly === true;
  const typeOnly = clauseTypeOnly || (names.length > 0 && names.every((name) => name.typeOnly));
  return { names, specifier, typeOnly };
}

function importNames(node: ts.ImportDeclaration | ts.ExportDeclaration): ImportName[] {
  if (!ts.isImportDeclaration(node) || !node.importClause) return [];
  const clauseTypeOnly = node.importClause.isTypeOnly === true;
  const bindings = node.importClause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return [];
  return bindings.elements.map((element) => ({
    name: (element.propertyName ?? element.name).text,
    typeOnly: clauseTypeOnly || element.isTypeOnly === true,
  }));
}

function moduleSpecifier(node: ts.ImportDeclaration | ts.ExportDeclaration): string | undefined {
  const specifier = node.moduleSpecifier;
  return specifier && ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function locate(path: string): Location | undefined {
  const normalized = path.replace(/\\/gu, "/").replace(/^\.\//u, "");
  if (!normalized.startsWith("src/")) return undefined;
  const test = normalized.endsWith(".test.ts");
  const parts = normalized.slice("src/".length).split("/");
  const [head, ...rest] = parts;
  if (!head || rest.length === 0 && !normalized.endsWith(".ts")) return undefined;
  if (head === integrationsModule) return { layer: "integration", module: integrationsModule, test };
  if (planned.has(head)) return locatePlanned(head as ModuleName, rest, test);
  return undefined;
}

function locatePlanned(moduleName: ModuleName, parts: string[], test: boolean): Location | undefined {
  if (moduleName === "kernel") return { layer: "kernel", module: moduleName, test };
  if (moduleName === "app") return { layer: "app", module: moduleName, test };
  if (parts.length === 1 && parts[0] === "index.ts")
    return { layer: "entry", module: moduleName, test };
  const [layer] = parts;
  if (layer === "domain" && parts.length > 2) return { layer: "domain", module: moduleName, test };
  if (layer === "application" && parts.length > 1)
    return { layer: "application", module: moduleName, test };
  if (layer === "infra" && parts.length > 1) return { layer: "infra", module: moduleName, test };
  return undefined;
}

function resolveRelative(file: string, specifier: string): string {
  const target = posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\.js$/u, "");
  return target.endsWith(".ts") ? target : `${target}.ts`;
}

function isModuleIndex(path: string): boolean {
  return /\/index\.ts$/u.test(path) && path.split("/").length === 3;
}

function nodeAllowed(layer: LayerName): boolean {
  return layer === "infra" || layer === "app" || layer === "entry" || layer === "integration";
}

function isNode(specifier: string): boolean {
  return specifier.startsWith("node:") || isBuiltin(specifier);
}

function isEffect(specifier: string): boolean {
  return specifier === "effect" || specifier.startsWith("effect/") || specifier.startsWith("@effect/");
}

function packageName(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0] ?? specifier;
}

function parse(file: SourceInput): ts.SourceFile {
  return ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function violation(file: string, rule: string, message: string): Violation {
  return { file, message, rule };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
