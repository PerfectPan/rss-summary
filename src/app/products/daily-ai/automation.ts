import type { RivusAutomationTemplate } from "@rivus/agent";

import type { RssAutomationPresentation } from "../../render/automation.js";
import { automationPresentationForText } from "../../render/view-store.js";
import { dailyAiEditorialPolicy, RSS_SUMMARY_DAILY_AI_TOOL_ID } from "./tool.js";

export const RSS_SUMMARY_DAILY_AI_AUTOMATION_ID = "rss-summary/daily-ai-digest";

export function dailyAiAutomation(profileId: string): RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
} {
  return {
    createInput: ({ occurrence }) => ({
      text: `请严格按顺序完成 Daily AI Digest：\n\n1. 调用 ${RSS_SUMMARY_DAILY_AI_TOOL_ID}，输入 ${JSON.stringify({ occurrence, phase: "collect" })}，获取指定时间窗口内的候选内容。\n2. 根据 collect 返回的 evidence 自主筛选、去重、归类并生成结构化草稿 Array<{category, headline, refs}>。仅依据 evidence 写作，不补充未经来源支持的事实；单条内容不合格时跳过该条，不影响其他条目。\n${dailyAiEditorialPolicy}\n3. 调用 ${RSS_SUMMARY_DAILY_AI_TOOL_ID}，输入 ${JSON.stringify({ occurrence, phase: "render" })} 并增加 draft 字段，生成最终 Markdown。若校验失败，根据错误信息修正对应条目并重试，最多两次。\n4. render 成功后，直接将返回结果中的 markdown 字段作为最终回复。最终回复只包含该字段内容，不描述执行步骤、调用结果或校验过程，不添加任何说明或代码围栏，也不改写该字段。`,
    }),
    createPresentation: ({ text }) => automationPresentationForText(text, "daily-ai"),
    id: RSS_SUMMARY_DAILY_AI_AUTOMATION_ID,
    profileId,
    requestedSkillIds: [],
    requestedToolIds: [RSS_SUMMARY_DAILY_AI_TOOL_ID],
  };
}
