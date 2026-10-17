import { execFile } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type { ReadRequest, ReadResult, VideoVisuals } from "../../domain/document/document.js";
import { isVideoResearchUrl, validateResearchUrl } from "../../domain/document/url-policy.js";
import { asRecord, text } from "./json-record.js";
import { captureVideoFrames } from "./video-frames.js";

type RunCommand = (
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string }>;

type TranscriptMethod = "captions" | "transcription";

export type VideoTranscriptFormatter = (
  transcript: string,
  method: TranscriptMethod,
  maximum?: number,
) => string;

export type VideoVisualFormatter = (visuals: VideoVisuals) => string;

type VideoResearchOptions = {
  captureFrames?: typeof captureVideoFrames;
  command?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  formatTranscript: VideoTranscriptFormatter;
  formatVisuals: VideoVisualFormatter;
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
  private readonly formatTranscript: VideoTranscriptFormatter;
  private readonly formatVisuals: VideoVisualFormatter;
  private readonly maxBytes: number;
  private readonly runCommand: RunCommand;
  private readonly timeoutMs: number;

  constructor(options: VideoResearchOptions) {
    this.captureFrames = options.captureFrames ?? captureVideoFrames;
    this.command = options.command ?? "summarize";
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetch ?? fetch;
    this.formatTranscript = options.formatTranscript;
    this.formatVisuals = options.formatVisuals;
    this.maxBytes = options.maxBytes ?? 1_000_000_000;
    this.runCommand = options.runCommand ?? execute;
    this.timeoutMs = options.timeoutMs ?? 600_000;
  }

  async research(request: ReadRequest): Promise<ReadResult> {
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
      const visualText = this.formatVisuals(visualResearch.visuals).slice(0, 3_300);
      return {
        ...visualResearch,
        content: `${this.formatTranscript(transcript, method, MAX_CONTENT_CHARS - visualText.length - 2)}\n\n${visualText}`,
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
      // One property read; nullish receivers yield undefined.
      const code: unknown = error == null ? undefined : (error as { code?: unknown }).code;
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
