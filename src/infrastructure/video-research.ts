import { execFile } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import get from "lodash-es/get.js";

import {
  isVideoResearchUrl,
  validateResearchUrl,
  type ArticleResearchRequest,
  type ArticleResearchResult,
} from "./article-research.js";
import { asRecord, text } from "./parsing.js";
import { captureVideoFrames, videoVisualEvidence } from "./video-frames.js";

type RunCommand = (
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string }>;

type VideoResearchOptions = {
  captureFrames?: typeof captureVideoFrames;
  command?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  maxBytes?: number;
  runCommand?: RunCommand;
  timeoutMs?: number;
};

const execute = promisify(execFile);
const MAX_CONTENT_CHARS = 5_500;

/** Use Summarize's caption/transcription pipeline; never accept its description-only fallback. */
export class VideoResearchClient {
  private readonly captureFrames: typeof captureVideoFrames;
  private readonly command: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly maxBytes: number;
  private readonly runCommand: RunCommand;
  private readonly timeoutMs: number;

  constructor(options: VideoResearchOptions = {}) {
    this.captureFrames = options.captureFrames ?? captureVideoFrames;
    this.command = options.command ?? "summarize";
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetch ?? fetch;
    this.maxBytes = options.maxBytes ?? 1_000_000_000;
    this.runCommand = options.runCommand ?? execute;
    this.timeoutMs = options.timeoutMs ?? 600_000;
  }

  async research(request: ArticleResearchRequest): Promise<ArticleResearchResult> {
    const retrievedAt = new Date().toISOString();
    let workspace: string | undefined;
    try {
      const url = validateResearchUrl(request.url);
      if (!isVideoResearchUrl(url)) throw new Error("Unsupported video URL.");
      const extension = extname(new URL(url).pathname).toLowerCase();
      const directFile = [".mp4", ".m4v", ".webm", ".mov"].includes(extension);
      let input = url;
      if (directFile) {
        workspace = await mkdtemp(join(tmpdir(), "rss-summary-video-"));
        input = join(workspace, `media${extension}`);
        // Summarize's remote yt-dlp path requests audio-only formats that direct MP4s lack.
        await this.download(url, input);
      }
      const { stdout } = await this.run(input, directFile);
      let transcript: string;
      let title = "";
      let method: "captions" | "transcription" = "transcription";
      if (directFile) {
        // Summarize 0.25.1 emits plain text for local media even with --extract --json.
        if (!stdout.trimStart().startsWith("Transcript:")) {
          throw new Error("Summarize returned no audio transcript.");
        }
        transcript = stdout.trim().slice("Transcript:".length).trim();
      } else {
        const extracted = asRecord(asRecord(JSON.parse(stdout)).extracted);
        const source = text(extracted.transcriptSource);
        if (
          !source ||
          !["youtubei", "captionTracks", "whisper", "apify"].includes(source) ||
          typeof extracted.transcriptCharacters !== "number" ||
          !Number.isFinite(extracted.transcriptCharacters) ||
          extracted.transcriptCharacters < 80
        ) {
          throw new Error("No captions or audio transcript were available for this video.");
        }
        if (extracted.truncated === true) throw new Error("Video transcript was incomplete.");
        transcript = text(extracted.content) ?? "";
        title = text(extracted.title) ?? "";
        method = source === "whisper" ? "transcription" : "captions";
      }
      if (transcript.length < 80) throw new Error("Video transcript was too short.");
      const visualResearch = await this.captureFrames({
        input,
        sourceUrl: url,
        transcript,
        directory: this.env.RSS_VIDEO_RESEARCH_DIR ?? ".state/video-research",
        visionArgs: this.env.RSS_VIDEO_VISION_MODEL?.trim()
          ? ["--model", this.env.RSS_VIDEO_VISION_MODEL.trim()]
          : ["--cli", this.env.RSS_VIDEO_VISION_CLI?.trim() || "codex"],
        timeoutMs: this.timeoutMs,
        run: (args, timeout) =>
          this.runCommand(this.command, args, {
            timeout,
            maxBuffer: 4_000_000,
            env: this.env,
          }),
      });
      const visualText = videoVisualEvidence(visualResearch.visuals).slice(0, 3_300);
      return {
        ...visualResearch,
        content: `${transcriptEvidence(transcript, method, MAX_CONTENT_CHARS - visualText.length - 2)}\n\n${visualText}`,
        fetchedUrl: url,
        method,
        ref: request.ref,
        retrievedAt,
        status: "ok",
        title,
        url,
      };
    } catch (error) {
      return {
        error:
          error instanceof SyntaxError
            ? "Summarize returned invalid transcript JSON."
            : String(error instanceof Error ? error.message : error),
        ref: request.ref,
        retrievedAt,
        status: "failed",
        url: request.url,
      };
    } finally {
      if (workspace) await rm(workspace, { recursive: true, force: true });
    }
  }

  private async run(input: string, directFile: boolean): Promise<{ stdout: string }> {
    try {
      return await this.runCommand(
        this.command,
        [
          input,
          "--extract",
          directFile ? "--plain" : "--json",
          "--format",
          "text",
          "--firecrawl",
          "off",
          "--no-slides",
          "--no-identify-speakers",
          "--transcriber",
          "whisper",
          "--metrics",
          "off",
          "--timeout",
          `${this.timeoutMs}ms`,
        ],
        { timeout: this.timeoutMs, maxBuffer: 4_000_000, env: this.env },
      );
    } catch (error) {
      const code: unknown = get(error, "code");
      if (code === "ENOENT") throw new Error("Install the Summarize CLI to research videos.");
      throw new Error(
        "Video transcription failed or timed out; check Summarize, media access and the local Whisper model.",
      );
    }
  }

  private async download(url: string, path: string): Promise<void> {
    let target = url;
    const signal = AbortSignal.timeout(this.timeoutMs);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await this.fetchImpl(validateResearchUrl(target), {
        redirect: "manual",
        signal,
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new Error("Video redirect has no location.");
        target = new URL(location, target).toString();
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Video download returned HTTP ${response.status}.`);
      }
      const type = response.headers.get("content-type") ?? "";
      if (!/^(?:video\/|application\/octet-stream)/iu.test(type)) {
        await response.body?.cancel();
        throw new Error("Video URL did not return a media file.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Video response was empty.");
      const file = await open(path, "wx");
      let bytes = 0;
      try {
        if (Number(response.headers.get("content-length")) > this.maxBytes) {
          throw new Error("Video exceeds the download size limit.");
        }
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > this.maxBytes) throw new Error("Video exceeds the download size limit.");
          await file.writeFile(chunk.value);
        }
        if (bytes === 0) throw new Error("Video response was empty.");
      } finally {
        await reader.cancel();
        await file.close();
      }
      return;
    }
    throw new Error("Video exceeded the redirect limit.");
  }
}

function transcriptEvidence(
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
