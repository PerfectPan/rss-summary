export {
  type DocumentMaterials,
  type ReadRequest,
  type ReadResult,
  type VideoFrame,
  type VideoVisuals
} from "./domain/document/index.js";
export { isVideoResearchUrl, validateArticleResearchUrl, validateResearchUrl } from "./domain/document/index.js";
export type { ArticleExtract } from "./domain/document/index.js";
export { BrowserReader, GlmReader, HttpReader, VideoReader, type GlmPage } from "./application/ports.js";
export { readOriginal, type ReadOriginalResult } from "./application/use-cases/read-original.js";
