import { access, readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vite-plus/test";

import { VideoResearchClient } from "../../src/infrastructure/video-research.js";

const url = "https://www.youtube.com/watch?v=example";
const mediaUrl = "https://video.twimg.com/example.mp4";
const transcript = "A source-grounded explanation of durable agent execution and persistence. "
  .repeat(4)
  .trim();

function output(overrides: Record<string, unknown> = {}) {
  return {
    stdout: JSON.stringify({
      extracted: {
        title: "Video title",
        content: transcript,
        transcriptSource: "captionTracks",
        transcriptCharacters: transcript.length,
        truncated: false,
        ...overrides,
      },
    }),
  };
}

describe("video research", () => {
  it("extracts actual captions without invoking a summary model", async () => {
    const runCommand = vi.fn(async () => output());
    const result = await new VideoResearchClient({ runCommand }).research({ ref: "video:1", url });
    expect(result).toMatchObject({
      status: "ok",
      method: "captions",
      title: "Video title",
      url,
      fetchedUrl: url,
      ref: "video:1",
      content: expect.stringContaining(transcript),
    });
    expect(runCommand).toHaveBeenCalledWith(
      "summarize",
      expect.arrayContaining([url, "--extract", "--json", "--format", "text", "--no-slides"]),
      expect.objectContaining({ timeout: 600_000, maxBuffer: 4_000_000 }),
    );
  });

  it("preserves audio transcription provenance when YouTube has no captions", async () => {
    const client = new VideoResearchClient({
      runCommand: async () => output({ transcriptSource: "whisper" }),
    });
    expect(await client.research({ ref: "video:1", url })).toMatchObject({
      status: "ok",
      method: "transcription",
    });
  });

  it.each([
    { transcriptSource: "unavailable" },
    { transcriptSource: null },
    { transcriptSource: "unknown-provider" },
    { transcriptCharacters: undefined },
    { transcriptCharacters: 0 },
    { transcriptCharacters: "1000" },
    { content: "Too short" },
    { truncated: true },
  ])("rejects missing, description-only or incomplete transcripts: %j", async (overrides) => {
    const client = new VideoResearchClient({ runCommand: async () => output(overrides) });
    expect(await client.research({ ref: "video:1", url })).toMatchObject({ status: "failed" });
  });

  it("keeps excerpts from the start and end within the editorial evidence budget", async () => {
    const content = `Opening argument. ${"Middle evidence. ".repeat(1200)}Final caveat.`;
    const client = new VideoResearchClient({
      runCommand: async () => output({ content, transcriptCharacters: content.length }),
    });
    const result = await client.research({ ref: "video:1", url });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.content.length).toBeLessThanOrEqual(5500);
    expect(result.content).toContain("五段节选");
    expect(result.content).toContain("Opening argument.");
    expect(result.content).toContain("Final caveat.");
  });

  it.each(["https://example.com/post", "http://127.0.0.1/video.mp4"])(
    "rejects unsupported or private inputs before any IO: %s",
    async (input) => {
      const runCommand = vi.fn();
      const fetch = vi.fn();
      const client = new VideoResearchClient({ runCommand, fetch });
      expect(await client.research({ ref: "video:1", url: input })).toMatchObject({
        status: "failed",
      });
      expect(runCommand).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("returns a structured error for invalid CLI JSON", async () => {
    const client = new VideoResearchClient({ runCommand: async () => ({ stdout: "not JSON" }) });
    expect(await client.research({ ref: "video:1", url })).toMatchObject({
      status: "failed",
      error: "Summarize returned invalid transcript JSON.",
    });
  });

  it.each(["ENOENT", "ETIMEDOUT"])(
    "reports CLI failures without leaking process stderr: %s",
    async (code) => {
      const client = new VideoResearchClient({
        runCommand: async () => {
          throw Object.assign(new Error("private config and process output"), { code });
        },
      });
      const result = await client.research({ ref: "video:1", url });
      expect(result.status).toBe("failed");
      if (result.status !== "failed") return;
      expect(result.error).not.toContain("private config");
      expect(result.error).toContain(code === "ENOENT" ? "Install" : "timed out");
    },
  );

  it("downloads direct MP4 once, transcribes locally and cleans up the temporary file", async () => {
    let mediaPath = "";
    const fetch = vi.fn(
      async () => new Response("media bytes", { headers: { "content-type": "video/mp4" } }),
    );
    const client = new VideoResearchClient({
      fetch,
      runCommand: async (_command, args) => {
        mediaPath = args[0];
        expect(await readFile(mediaPath, "utf8")).toBe("media bytes");
        expect(args).toContain("--plain");
        return { stdout: `Transcript:\n${transcript}` };
      },
    });
    expect(await client.research({ ref: "video:2", url: mediaUrl })).toMatchObject({
      status: "ok",
      method: "transcription",
      title: "",
      url: mediaUrl,
      fetchedUrl: mediaUrl,
      content: expect.stringContaining(transcript),
    });
    expect(fetch).toHaveBeenCalledOnce();
    await expect(access(mediaPath)).rejects.toThrow();
  });

  it("removes downloaded media after transcription failure", async () => {
    let mediaPath = "";
    const client = new VideoResearchClient({
      fetch: async () => new Response("media", { headers: { "content-type": "video/mp4" } }),
      runCommand: async (_command, args) => {
        mediaPath = args[0];
        return { stdout: "Only metadata, no audio transcript" };
      },
    });
    expect(await client.research({ ref: "video:2", url: mediaUrl })).toMatchObject({
      status: "failed",
    });
    await expect(access(mediaPath)).rejects.toThrow();
  });

  it.each([
    { status: 403 },
    { status: 200, type: "text/html", body: "Sign in" },
    { status: 200, type: "video/mp4", size: "100", body: "media" },
    { status: 200, type: "video/mp4", body: "oversized stream" },
    { status: 200, type: "video/mp4", body: "" },
    { status: 302 },
    { status: 302, location: "http://127.0.0.1/video.mp4" },
  ])(
    "rejects denied, invalid or oversized media: %j",
    async ({ status, type, size, body, location }) => {
      const runCommand = vi.fn();
      const fetch = vi.fn(
        async () =>
          new Response(body ?? "", {
            status,
            headers: {
              ...(type ? { "content-type": type } : {}),
              ...(size ? { "content-length": size } : {}),
              ...(location ? { location } : {}),
            },
          }),
      );
      const client = new VideoResearchClient({ fetch, runCommand, maxBytes: 10 });
      expect(await client.research({ ref: "video:2", url: mediaUrl })).toMatchObject({
        status: "failed",
      });
      expect(runCommand).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("follows bounded public redirects", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/resolved.mp4" },
        }),
      )
      .mockResolvedValueOnce(new Response("media", { headers: { "content-type": "video/mp4" } }));
    const client = new VideoResearchClient({
      fetch,
      runCommand: async () => ({ stdout: `Transcript:\n${transcript}` }),
    });
    expect(await client.research({ ref: "video:2", url: mediaUrl })).toMatchObject({
      status: "ok",
    });
    expect(fetch.mock.calls[1][0]).toBe("https://video.twimg.com/resolved.mp4");
  });

  it("stops redirect loops", async () => {
    const client = new VideoResearchClient({
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: mediaUrl },
        }),
    });
    expect(await client.research({ ref: "video:2", url: mediaUrl })).toMatchObject({
      status: "failed",
      error: "Video exceeded the redirect limit.",
    });
  });
});
