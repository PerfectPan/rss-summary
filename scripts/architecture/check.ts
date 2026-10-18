import { isBuiltin } from "node:module";
import { posix } from "node:path";

import ts from "typescript";

import {
  adapterPackages,
  effectRunFiles,
  infraPackages,
  layerDependencies,
  type LayerName,
  type ModuleName,
  moduleRules,
  modules,
  playwrightFiles,
  sourceVocabulary,
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
  module: ModuleName;
  test: boolean;
};

const planned = new Set<string>(modules);
const sourceWord = new RegExp(`\\b(?:${sourceVocabulary.map(escapeRegExp).join("|")})\\b`, "giu");

export function checkBoundaries(files: readonly SourceInput[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
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
    if (target.module === location.module) continue;
    if (target.module === "legacy" || location.module === "legacy") {
      violations.push(
        violation(
          file.path,
          "module-dependency",
          `${location.module} may not import ${target.module}`,
        ),
      );
      continue;
    }
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
  const target = locate(targetPath);
  if (!target) {
    return [violation(file, "relative-escape", `${ref.specifier} does not resolve inside a module`)];
  }
  if (target.module !== location.module) return checkCrossModule(file, location, target, targetPath, ref);
  if (location.layer === "domain" && target.layer === "adapters") {
    return [violation(file, "layer", "domain/ may not import adapters/")];
  }
  if (!layerDependencies[location.layer].includes(target.layer)) {
    return [violation(file, "layer", `${location.layer}/ may not import ${target.layer}/`)];
  }
  return [];
}

function checkCrossModule(
  file: string,
  source: Location,
  target: Location,
  targetPath: string,
  ref: ImportRef,
): Violation[] {
  if (source.module === "legacy" || target.module === "legacy") {
    return [violation(file, "module-dependency", `${source.module} may not import ${target.module}`)];
  }
  const rule = moduleRules[source.module];
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
  if ((rule.indexOnly || source.layer === "app") && !isModuleIndex(targetPath)) {
    return [violation(file, "deep-import", `${source.module} may import ${target.module} only through index.ts`)];
  }
  return [];
}

function checkEffect(file: string, layer: LayerName, ref: ImportRef): Violation[] {
  if (layer === "adapters") {
    return schemaOnly(ref)
      ? []
      : [violation(file, "effect", "adapters/ may import only effect/Schema, not other Effect APIs")];
  }
  if (layer === "application" || layer === "infra" || layer === "app" || layer === "entry") return [];
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
      : [violation(file, "playwright", "playwright is only allowed in the browser adapters")];
  }
  const allowed: readonly string[] =
    location.layer === "adapters" ? adapterPackages : location.layer === "infra" ? infraPackages : [];
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
  // Concept directories and the editorial entry (the module that must stay
  // source-neutral end to end) may not name any provider.
  const vocabularyChecked =
    location.layer === "domain" || (location.layer === "entry" && location.module === "editorial");
  if (vocabularyChecked) {
    const words = [...new Set((file.source.match(sourceWord) ?? []).map((word) => word.toLowerCase()))].sort();
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

function schemaOnly(ref: ImportRef): boolean {
  const names = ref.names.map((name) => name.name);
  if (names.length === 0 || names.some((name) => name !== "Schema")) return false;
  return ref.specifier === "effect" || ref.specifier === "effect/Schema";
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
  if (planned.has(head)) return locatePlanned(head as Exclude<ModuleName, "legacy">, rest, test);
  if (head === "domain")
    return { layer: rest[1] === "adapters" ? "adapters" : "domain", module: "legacy", test };
  if (head === "application") return { layer: "application", module: "legacy", test };
  if (head === "infrastructure") return { layer: "infra", module: "legacy", test };
  if (head === "presentation") return { layer: "app", module: "legacy", test };
  return undefined;
}

function locatePlanned(
  moduleName: Exclude<ModuleName, "legacy">,
  parts: string[],
  test: boolean,
): Location | undefined {
  if (moduleName === "kernel") return { layer: "kernel", module: moduleName, test };
  if (moduleName === "app") return { layer: "app", module: moduleName, test };
  if (parts.length === 1 && parts[0] === "index.ts")
    return { layer: "entry", module: moduleName, test };
  const [layer, concept, maybeAdapters] = parts;
  if (layer === "domain" && concept && maybeAdapters === "adapters" && parts.length > 3) {
    return { layer: "adapters", module: moduleName, test };
  }
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
  return layer === "infra" || layer === "app" || layer === "entry";
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
