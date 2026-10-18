import { Context, type Effect } from "effect";

import type { ReadRequest, ReadResult } from "../domain/document/index.js";

export type GlmPage = {
  title: string;
  url: string;
  content: string;
  truncated: boolean;
  publishedAt?: string;
};

export class HttpReader extends Context.Service<
  HttpReader,
  {
    readonly research: (request: ReadRequest) => Effect.Effect<ReadResult>;
  }
>()("rss-summary/reading/HttpReader/v1") {}

export class BrowserReader extends Context.Service<
  BrowserReader,
  {
    readonly research: (request: ReadRequest) => Effect.Effect<ReadResult>;
  }
>()("rss-summary/reading/BrowserReader/v1") {}

export class VideoReader extends Context.Service<
  VideoReader,
  {
    readonly research: (request: ReadRequest) => Effect.Effect<ReadResult>;
  }
>()("rss-summary/reading/VideoReader/v1") {}

export class GlmReader extends Context.Service<
  GlmReader,
  {
    readonly read: (url: string) => Effect.Effect<GlmPage, unknown>;
  }
>()("rss-summary/reading/GlmReader/v1") {}
