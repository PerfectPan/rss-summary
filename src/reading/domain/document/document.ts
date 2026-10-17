export const documentMethods = ["browser", "http", "captions", "transcription"] as const;

export type DocumentMethod = (typeof documentMethods)[number];

export type VideoFrame = {
  index: number;
  timestampSeconds: number;
  imagePath: string;
  ocrText?: string;
  visualText?: string;
  visionModel?: string;
};

export type VideoVisuals = {
  status: "analyzed" | "partial" | "unavailable";
  frames: VideoFrame[];
  reason?: string;
};

export type DocumentMaterials = {
  transcriptPath: string;
  manifestPath: string;
};

/** Successful read of one URL. `method` excludes the reader name that the source-vocabulary rule forbids in domain. */
export type Document = {
  url: string;
  fetchedUrl: string;
  title: string;
  content: string;
  retrievedAt: string;
  method?: DocumentMethod;
  materials?: DocumentMaterials;
  visuals?: VideoVisuals;
};

export type ReadRequest = {
  ref: string;
  url: string;
};

export type ReadSuccess = Document & {
  ref: string;
  status: "ok";
};

export type ReadFailure = {
  error: string;
  method?: DocumentMethod;
  ref: string;
  retrievedAt: string;
  status: "failed";
  url: string;
};

export type ReadResult = ReadSuccess | ReadFailure;
