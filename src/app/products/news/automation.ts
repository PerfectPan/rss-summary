import type { RivusAutomationTemplate } from "@rivus/agent";

import type { RssAutomationPresentation } from "../../render/automation.js";
import { automationPresentationForText } from "../../render/view-store.js";
import { RSS_SUMMARY_NEWS_TOOL_ID } from "./tool.js";

export const RSS_SUMMARY_NOON_AUTOMATION_ID = "rss-summary/noon-news-brief";
export const RSS_SUMMARY_EVENING_AUTOMATION_ID = "rss-summary/evening-news-brief";

function newsAutomation(options: {
  edition: "noon" | "evening";
  id: string;
  profileId: string;
}): RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
} {
  return {
    createInput: ({ occurrence }) => ({
      text: `请只调用一次 ${RSS_SUMMARY_NEWS_TOOL_ID}，输入 ${JSON.stringify({ occurrence, edition: options.edition })}。成功后仅将结果中的 markdown 字段原样返回，不添加任何说明。`,
    }),
    createPresentation: ({ text }) => automationPresentationForText(text, "news"),
    id: options.id,
    profileId: options.profileId,
    requestedSkillIds: [],
    requestedToolIds: [RSS_SUMMARY_NEWS_TOOL_ID],
  };
}

export function noonNewsAutomation(profileId: string) {
  return newsAutomation({ edition: "noon", id: RSS_SUMMARY_NOON_AUTOMATION_ID, profileId });
}

export function eveningNewsAutomation(profileId: string) {
  return newsAutomation({ edition: "evening", id: RSS_SUMMARY_EVENING_AUTOMATION_ID, profileId });
}
