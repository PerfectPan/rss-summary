export {
  documentMethods,
  type Document,
  type DocumentMaterials,
  type DocumentMethod,
  type ReadFailure,
  type ReadRequest,
  type ReadResult,
  type ReadSuccess,
  type VideoFrame,
  type VideoVisuals,
} from "./domain/document/index.js";
export {
  isPrivateIpv4,
  isVideoResearchUrl,
  validateArticleResearchUrl,
  validateResearchUrl,
} from "./domain/document/index.js";
export { extractArticle } from "./domain/document/adapters/html-article.js";
export {
  BrowserReader,
  GlmReader,
  HttpReader,
  VideoReader,
  type GlmPage,
} from "./application/ports.js";
export {
  readOriginal,
  type ReadMethod,
  type ReadMode,
  type ReadOriginalRequest,
  type ReadOriginalResult,
} from "./application/use-cases/read-original.js";
export {
  ArticleResearchClient,
  type ArticleExtract,
  type ArticleResearchClientOptions,
  type ArticleResearchRequest,
  type ArticleResearchResult,
} from "./infra/adapters/http-reader.js";
export {
  browserArticleResearch,
  type BrowserPageFetcher,
  type BrowserReaderOptions,
} from "./infra/adapters/browser-reader.js";
