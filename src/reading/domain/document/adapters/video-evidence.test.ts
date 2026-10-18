import { describe, expect, it } from "vite-plus/test";

import { transcriptEvidence, videoVisualEvidence } from "./video-evidence.js";

describe("video evidence", () => {
  it("quotes verified frame text and omits OCR-only frames", () => {
    const evidence = videoVisualEvidence({
      status: "partial",
      frames: [
        { index: 1, timestampSeconds: 30, imagePath: "/frame-1.png", ocrText: "OCR only" },
        {
          index: 2,
          timestampSeconds: 60,
          imagePath: "/frame-2.png",
          visualText: "画面显示 SQLite 存储初始化代码。",
        },
      ],
    });
    expect(evidence).toContain("部分画面分析失败");
    expect(evidence).toContain("60.0");
    expect(evidence).not.toContain("30.0");
    expect(evidence).not.toContain("OCR only");
  });

  it("keeps a short caption and excerpts a long transcript", () => {
    expect(transcriptEvidence("Verified captions.", "captions")).toContain("视频字幕");
    const content = `Opening argument. ${"Middle evidence. ".repeat(1200)}Final caveat.`;
    const evidence = transcriptEvidence(content, "transcription", 2_000);
    expect(evidence).toContain("五段节选");
    expect(evidence).toContain("Opening argument.");
    expect(evidence).toContain("Final caveat.");
  });

  it("says visual inspection is unavailable when no frame was analyzed", () => {
    expect(
      videoVisualEvidence({ status: "unavailable", frames: [], reason: "not inspected" }),
    ).toContain("画面分析不可用");
  });
});
