import type { RivusAutomationTemplate } from "@rivus/agent";

import {
  automationPresentationForText,
  type RssAutomationPresentation,
} from "../../render/automation.js";
import { RSS_SUMMARY_RESEARCH_TOOL_ID } from "../research/tool.js";
import { RSS_SUMMARY_TOOL_ID } from "./tool.js";

export const RSS_SUMMARY_MORNING_AUTOMATION_ID = "rss-summary/morning-feed-digest";
export const RSS_SUMMARY_AUTOMATION_SUPPRESSED =
  "RIVUS_AUTOMATION_SUPPRESSED: no high-value subscription updates";

/** Automation presentations reuse the subscriptions renderer's section titles. */
export const subscriptionsPresentation = (text: string): RssAutomationPresentation =>
  automationPresentationForText(text, "subscriptions");

export function subscriptionsAutomation(profileId: string): RivusAutomationTemplate & {
  createPresentation(output: { occurrence: string; text: string }): RssAutomationPresentation;
} {
  return {
    createInput: ({ occurrence }) => ({
      text: `请严格按顺序完成“我的订阅”：\n1. 调用 ${RSS_SUMMARY_TOOL_ID}，输入 ${JSON.stringify({ occurrence, window: "previous-calendar-day", onlyNew: true, rssOnly: false, phase: "collect" })}。\n2. 基于 collect 返回的全部 evidence 做第二轮 AI 精选：逐条判断是否值得推送给用户，重点考虑实际影响、与用户订阅兴趣的相关性、信息新颖性和证据充分性；普通 star/watch、重复公告、低信息量改动、仅标题变化和无法说明价值的条目应 selected=false。必须为每条 evidence 输出一项 Array<{ref, selected, reason}>，reason 用简短中文说明取舍，不得补写事实。若没有任何值得推送的条目，全部 selected=false。\n3. 再调用同一 Tool，输入 ${JSON.stringify({ occurrence, window: "previous-calendar-day", onlyNew: true, rssOnly: false, phase: "select" })} 并增加 selection 字段，值为上一步的完整精选结果。\n4. 对每个 selected=true 且有 URL 的 evidence 调用 ${RSS_SUMMARY_RESEARCH_TOOL_ID}，输入 {ref, url, mode:"auto"}；该 Tool 对文章优先读取浏览器正文并回退 HTTP；对视频调用 Summarize 获取字幕或转写音频，并由视觉模型分析抽取的关键帧。不要抓取未选中的条目。研究失败时该条目改为 selected=false，不要用猜测补写。\n5. 只对研究成功的 selected=true evidence 生成摘要：摘要风格对齐 Daily AI Digest 的单条事件句，直接写主体、动作、具体变化或结果与影响；每条 1–2 句、180 字以内中文。必须依据研究 Tool 返回的 content（正文、字幕/转写和带时间点的画面证据）；返回节选时仅概括节选支持的内容，画面仅经过关键帧抽样；visuals.status 为 partial 或 unavailable 时不得声称完整看过画面，也不能把图片路径或 OCR 文本当作视觉模型已查看的证据；只能依据证据，不得补写来源中没有的数字或事实，也不要为 summaryPolicy=none 的条目生成摘要。若 URL 指向一篇日报，只概括其中高价值主题，不把整篇拆成多条，也不要写“来源名发布原始标题”或宣传语。\n6. 再调用同一 Tool，输入 ${JSON.stringify({ occurrence, window: "previous-calendar-day", onlyNew: true, rssOnly: false, phase: "render" })} 并增加 selection、research 与 draft 字段。若 selected=true 的条目为 0，render 仍返回空结果，最终只返回精确标记 \\"${RSS_SUMMARY_AUTOMATION_SUPPRESSED}\\"；否则仅将 render 返回的 markdown 字段原样返回，不得自行改写、添加或删除事实。`,
    }),
    createPresentation: ({ text }) => subscriptionsPresentation(text),
    id: RSS_SUMMARY_MORNING_AUTOMATION_ID,
    profileId,
    requestedSkillIds: [],
    requestedToolIds: [RSS_SUMMARY_TOOL_ID, RSS_SUMMARY_RESEARCH_TOOL_ID],
  };
}
