import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { captureVideoFrames, videoVisualEvidence } from "../../src/infrastructure/video-frames.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8sAAAAASUVORK5CYII=",
  "base64",
);
const sourceUrl = "https://video.example.com/demo.mp4";
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "rss-video-frames-test-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

function options(run: Parameters<typeof captureVideoFrames>[0]["run"]) {
  return {
    input: "https://video.example.com/demo.mp4",
    sourceUrl,
    transcript: "Complete transcript. ".repeat(1000),
    directory,
    visionArgs: ["--cli", "codex"],
    timeoutMs: 600_000,
    run,
  };
}

async function extracted(args: string[]) {
  const output = args[args.indexOf("--slides-dir") + 1];
  const frames = await Promise.all(
    [1, 2].map(async (index) => {
      const imagePath = join(output, `frame-${index}.png`);
      await writeFile(imagePath, png);
      return { index, timestamp: index * 30, imagePath, ocrText: "OCR only: unverified layout" };
    }),
  );
  return { stdout: JSON.stringify({ ok: true, slides: { slides: frames } }) };
}

function analyzed() {
  return {
    stdout: JSON.stringify({
      summary: JSON.stringify({ status: "ok", text: "画面中有 SQLite 存储代码和三个并排的节点。" }),
      llm: { model: "cli/codex" },
    }),
  };
}

describe("video frame research", () => {
  it("sends actual frame files to the vision model and preserves the full source material", async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === "slides") return extracted(args);
      expect(await readFile(args[0])).toEqual(png);
      expect(args).toContain("--cli");
      return analyzed();
    });
    const input = options(run);
    const result = await captureVideoFrames(input);
    expect(result.visuals.status).toBe("analyzed");
    expect(result.visuals.frames).toHaveLength(2);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls[0][0]).toEqual(
      expect.arrayContaining(["slides", sourceUrl, "--slides-max", "6", "--slides-ocr"]),
    );
    expect(result.visuals.frames[0]).toMatchObject({
      timestampSeconds: 30,
      visualText: expect.stringContaining("SQLite"),
      visionModel: "cli/codex",
    });
    expect(await readFile(result.materials!.transcriptPath, "utf8")).toBe(input.transcript + "\n");
    const manifest = JSON.parse(await readFile(result.materials!.manifestPath, "utf8"));
    expect(manifest).toMatchObject({ sourceUrl, visuals: { status: "analyzed" } });
    const evidence = videoVisualEvidence(result.visuals);
    expect(evidence).toContain("画面 30.0 秒");
    expect(evidence).toContain("SQLite");
    expect(evidence).not.toContain("OCR only");
  });

  it("keeps verified observations when one frame fails", async () => {
    let modelCalls = 0;
    const result = await captureVideoFrames(
      options(async (args) => {
        if (args[0] === "slides") return extracted(args);
        if (++modelCalls === 1) throw new Error("model unavailable");
        return analyzed();
      }),
    );
    expect(result.visuals.status).toBe("partial");
    expect(result.visuals.frames[0].visualText).toBeUndefined();
    expect(videoVisualEvidence(result.visuals)).toContain("部分画面分析失败");
    expect(videoVisualEvidence(result.visuals)).toContain("60.0");
    expect(videoVisualEvidence(result.visuals)).not.toContain("30.0");
  });

  it.each([
    "not JSON",
    JSON.stringify({}),
    JSON.stringify({ summary: "not JSON" }),
    JSON.stringify({ summary: JSON.stringify({ status: "unavailable", text: "无法看到图片" }) }),
    JSON.stringify({ summary: JSON.stringify({ status: "ok", text: "短" }) }),
    JSON.stringify({ summary: JSON.stringify({ status: "ok", text: "a".repeat(501) }) }),
  ])("does not mistake OCR or invalid model output for visual inspection: %s", async (stdout) => {
    const result = await captureVideoFrames(
      options(async (args) => (args[0] === "slides" ? extracted(args) : { stdout })),
    );
    expect(result.visuals.status).toBe("unavailable");
    expect(result.visuals.frames).toHaveLength(2);
    expect(result.visuals.frames.every((frame) => !frame.visualText)).toBe(true);
    expect(videoVisualEvidence(result.visuals)).toContain("画面分析不可用");
  });

  it("retains transcription and failure provenance if frame extraction fails", async () => {
    const result = await captureVideoFrames(
      options(async () => {
        throw new Error("slides failed");
      }),
    );
    expect(result.visuals).toMatchObject({ status: "unavailable", frames: [] });
    expect(await readFile(result.materials!.transcriptPath, "utf8")).toContain(
      "Complete transcript",
    );
    expect(JSON.parse(await readFile(result.materials!.manifestPath, "utf8"))).toMatchObject({
      visuals: { status: "unavailable" },
    });
  });

  it.each(["outside", "not-png", "oversized", "duplicate", "negative-time", "too-many"])(
    "rejects unsafe frame outputs before any model call: %s",
    async (kind) => {
      const run = vi.fn(async (args: string[]) => {
        const result = JSON.parse((await extracted(args)).stdout);
        const frames = result.slides.slides;
        if (kind === "outside") {
          const outside = join(directory, "outside.png");
          await writeFile(outside, png);
          frames[0].imagePath = outside;
        }
        if (kind === "not-png") await writeFile(frames[0].imagePath, "private text");
        if (kind === "oversized") await writeFile(frames[0].imagePath, Buffer.alloc(4_000_001));
        if (kind === "duplicate") frames[1].index = 1;
        if (kind === "negative-time") frames[0].timestamp = -1;
        if (kind === "too-many") result.slides.slides = Array.from({ length: 7 }, () => frames[0]);
        return { stdout: JSON.stringify(result) };
      });
      const result = await captureVideoFrames(options(run));
      expect(result.visuals).toMatchObject({ status: "unavailable", frames: [] });
      expect(run).toHaveBeenCalledOnce();
    },
  );

  it("stops model calls after the frame research deadline", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const run = vi.fn(async (args: string[]) => {
      const result = await extracted(args);
      now.mockReturnValue(600_001);
      return result;
    });
    const result = await captureVideoFrames(options(run));
    expect(result.visuals.status).toBe("unavailable");
    expect(run).toHaveBeenCalledOnce();
  });

  it("reports artifact storage failures without failing the transcription caller", async () => {
    const file = join(directory, "not-a-directory");
    await writeFile(file, "file");
    const result = await captureVideoFrames({ ...options(vi.fn()), directory: file });
    expect(result.visuals.status).toBe("unavailable");
    expect(result.materials).toBeUndefined();
  });
});
