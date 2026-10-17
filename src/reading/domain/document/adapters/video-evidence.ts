import type { VideoVisuals } from "../document.js";

const MAX_CONTENT_CHARS = 5_500;

export function videoVisualEvidence(visuals: VideoVisuals): string {
  const descriptions = visuals.frames
    .filter((frame) => frame.visualText)
    .map((frame) => `[画面 ${frame.timestampSeconds.toFixed(1)} 秒] ${frame.visualText}`);
  if (descriptions.length === 0)
    return "画面分析不可用；以下文字仅依据字幕或音频，不包含已核验的视觉信息。";
  return `画面证据（关键帧抽样，未逐帧观看；${visuals.status === "partial" ? "部分画面分析失败" : "已读取抽取的画面"}）：\n${descriptions.join("\n")}`;
}

export function transcriptEvidence(
  transcript: string,
  method: "captions" | "transcription",
  maximum = MAX_CONTENT_CHARS,
): string {
  const note =
    method === "captions"
      ? "视频字幕（可能含自动字幕识别错误）。"
      : "视频音频转写（自动识别，可能有错字；不包含画面信息）。";
  if (transcript.length + note.length + 1 <= maximum) return `${note}\n${transcript}`;
  const excerpts = Array.from({ length: 5 }, (_, index) => {
    const width = Math.floor((maximum - 200) / 5);
    const start = Math.floor(((transcript.length - width) * index) / 4);
    return transcript.slice(start, start + width);
  });
  return `${note}\n全文过长，以下为按顺序覆盖开头至结尾的五段节选；仅据节选概括，不声称已核验全部细节。\n${excerpts.join("\n[…]\n")}`;
}
