import type { RivusAutomationTemplate } from "@rivus/agent";

import type { RssAutomationPresentation } from "../render/automation.js";

/** Automation templates carry a Markdown → presentation adapter for renderers. */
export type PresentationAutomation = RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
};

import { runDigestCommand, runFeedsCommand } from "./subscriptions/cli.js";
import { subscriptionsAutomation } from "./subscriptions/automation.js";
import { subscriptionsToolDescriptor } from "./subscriptions/tool.js";
import { runIndustryCommand } from "./frontier/cli.js";
import { frontierAutomation } from "./frontier/automation.js";
import { frontierToolDescriptor } from "./frontier/tool.js";
import { noonNewsAutomation, eveningNewsAutomation } from "./news/automation.js";
import { newsToolDescriptor } from "./news/tool.js";
import { dailyAiAutomation } from "./daily-ai/automation.js";
import { dailyAiToolDescriptor } from "./daily-ai/tool.js";
import { runResearchCommand } from "./research/cli.js";
import { researchToolDescriptor } from "./research/tool.js";

export type ProductCommand = {
  name: string;
  run: (argv: string[], deps: { stdout?: Clow; stderr?: Clow }) => Promise<number>;
};

type Clow = {
  write(chunk: string): unknown;
};

export type ProductDefinition = {
  id: string;
  tool: {
    descriptor: typeof subscriptionsToolDescriptor;
  };
  automations: (profileId: string) => PresentationAutomation[];
  commands: ProductCommand[];
};

/**
 * One entry per product. New hosts iterate this list for registration and CLI
 * dispatch; the Rivus plugin pins the exact registration order separately.
 */
export const products: readonly ProductDefinition[] = [
  {
    id: "subscriptions",
    tool: { descriptor: subscriptionsToolDescriptor },
    automations: (profileId) => [subscriptionsAutomation(profileId)],
    commands: [
      { name: "digest", run: runDigestCommand },
      { name: "feeds", run: runFeedsCommand },
    ],
  },
  {
    id: "frontier",
    tool: { descriptor: frontierToolDescriptor },
    automations: (profileId) => [frontierAutomation(profileId)],
    commands: [{ name: "industry", run: runIndustryCommand }],
  },
  {
    id: "news",
    tool: { descriptor: newsToolDescriptor },
    automations: (profileId) => [noonNewsAutomation(profileId), eveningNewsAutomation(profileId)],
    commands: [],
  },
  {
    id: "daily-ai",
    tool: { descriptor: dailyAiToolDescriptor },
    automations: (profileId) => [dailyAiAutomation(profileId)],
    commands: [],
  },
  {
    id: "research",
    tool: { descriptor: researchToolDescriptor },
    automations: () => [],
    commands: [{ name: "research", run: runResearchCommand }],
  },
];
