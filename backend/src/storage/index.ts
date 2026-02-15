import { StorageProvider } from "./StorageProvider";
import { BackendStorage } from "./providers/BackendStorage";
import { DAStorage } from "./providers/DAStorage";

export type StorageKind = "backend" | "da";

export function getStorageProvider(kind: StorageKind): StorageProvider {
  switch (kind) {
    case "da":
      return new DAStorage();
    case "backend":
    default:
      return new BackendStorage();
  }
}
