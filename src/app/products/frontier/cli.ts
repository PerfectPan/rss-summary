import { industryView, renderJsonIndustryBrief } from "../../render/layouts/industry.js";
import { renderViewMarkdown } from "../../render/markdown.js";
import { runProductCommand, type Writable } from "../shared/cli.js";
import { runIndustryFlow } from "./flow.js";

/** `rss-summary industry [--json] [--day YYYY-MM-DD] [--only-new] [--dry-run]` */
export async function runIndustryCommand(
  argv: string[],
  deps: { stdout?: Writable; stderr?: Writable } = {}
): Promise<number> {
  return runProductCommand(argv, deps, (resolved) =>
    runIndustryFlow(resolved, (document, format) =>
      format === "json" ? renderJsonIndustryBrief(document) : renderViewMarkdown(industryView(document))
    )
  );
}
