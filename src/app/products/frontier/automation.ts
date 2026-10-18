import type { RivusAutomationTemplate } from "@rivus/agent";

import {
  automationPresentationForText,
  type RssAutomationPresentation,
} from "../../render/automation.js";
import { RSS_SUMMARY_INDUSTRY_TOOL_ID } from "./tool.js";

export const RSS_SUMMARY_INDUSTRY_AUTOMATION_ID = "rss-summary/daily-industry-brief";

export function frontierAutomation(profileId: string): RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
} {
  return {
    createInput: ({ occurrence }) => ({
      text: `请只调用一次 ${RSS_SUMMARY_INDUSTRY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, onlyNew: true })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
    }),
    createPresentation: ({ text }) => automationPresentationForText(text, "industry"),
    id: RSS_SUMMARY_INDUSTRY_AUTOMATION_ID,
    profileId,
    requestedSkillIds: [],
    requestedToolIds: [RSS_SUMMARY_INDUSTRY_TOOL_ID],
  };
}
