import { Layer } from "effect";

import { NodeFileSystemLive } from "../platform/node-file-system.js";
import { SourceCatalogFileLive } from "../repository/source-catalog-file.js";
import { SourceCatalogStore } from "../../application/ports.js";

export const SourceCatalogStoreLive: Layer.Layer<SourceCatalogStore> = SourceCatalogFileLive.pipe(
  Layer.provide(NodeFileSystemLive),
);
