import { MetadataStore } from "./MetadataStore";
import { InMemoryMetadata } from "./providers/InMemoryMetadata";

export type MetadataKind = "memory";

export function getMetadataStore(_kind: MetadataKind = "memory"): MetadataStore {
  return new InMemoryMetadata();
}
