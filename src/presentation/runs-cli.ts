import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  listRunArtifacts,
  loadRunArtifact,
  runArtifactLabel,
} from "../infrastructure/run-store.js";
import { errorMessage } from "../infrastructure/parsing.js";

type Writable = { write(chunk: string): unknown };

export function runRunsCommand(
  argv: string[],
  deps: { stdout?: Writable; stderr?: Writable; env?: NodeJS.ProcessEnv } = {},
): number {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const env = deps.env ?? process.env;
  const command = argv[0] ?? "list";
  const root = valueFor(argv, "--dir") ?? env.FEED_RUN_LOG_DIR ?? ".state/runs";

  try {
    if (command === "list" || command === "failures") {
      const artifacts = listRunArtifacts(root)
        .map((path) => ({ path, run: loadRunArtifact(path) }))
        .filter(
          ({ run }) =>
            command !== "failures" ||
            run.delivery.status === "failed" ||
            run.delivery.stateStatus === "failed" ||
            run.sources.some((source) => source.status === "failed"),
        );
      if (artifacts.length === 0) {
        stdout.write(command === "failures" ? "No failed runs.\n" : "No run artifacts.\n");
        return 0;
      }
      for (const { path, run } of artifacts) {
        const sourceFailures = run.sources.filter((source) => source.status === "failed").length;
        stdout.write(
          `${run.generatedAt}  ${run.product}  ${run.delivery.status}  ${run.counts.selected} selected  ${sourceFailures} source failures  state:${run.delivery.stateStatus}  ${path}\n`,
        );
      }
      return 0;
    }

    if (command === "show") {
      const requested = argv[1];
      if (!requested || requested.startsWith("--")) {
        throw new Error("runs show requires an artifact path or run label.");
      }
      const directPath =
        isAbsolute(requested) || existsSync(requested) ? requested : join(root, requested);
      const path = directPath.endsWith(".json")
        ? directPath
        : listRunArtifacts(root).find((candidate) => runArtifactLabel(candidate) === requested);
      if (!path) throw new Error(`Run artifact not found: ${requested}`);
      stdout.write(`${JSON.stringify(loadRunArtifact(path), null, 2)}\n`);
      return 0;
    }

    writeRunsHelp(stdout);
    return command === "help" || command === "--help" || command === "-h" ? 0 : 1;
  } catch (error) {
    stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}

function valueFor(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function writeRunsHelp(stdout: Writable): void {
  stdout.write(`Usage:
  rss-summary runs list [--dir .state/runs]
  rss-summary runs failures [--dir .state/runs]
  rss-summary runs show <artifact-path-or-label> [--dir .state/runs]
`);
}
