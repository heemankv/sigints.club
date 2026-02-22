import { StoragePointer, StorageProvider, StoreResult } from "../StorageProvider";

export class DAStorage implements StorageProvider {
  async putCiphertext(_payload: Uint8Array, sha256: string): Promise<StoreResult> {
    return { pointer: { id: "da://ciphertext/TODO", sha256 } };
  }

  async getCiphertext(_pointer: StoragePointer): Promise<Uint8Array> {
    throw new Error("Not implemented");
  }

  async putKeybox(_payload: Uint8Array, sha256: string): Promise<StoreResult> {
    return { pointer: { id: "da://keybox/TODO", sha256 } };
  }

  async getKeybox(_pointer: StoragePointer): Promise<Uint8Array> {
    throw new Error("Not implemented");
  }

  async putPublic(_payload: Uint8Array, sha256: string): Promise<StoreResult> {
    return { pointer: { id: "da://public/TODO", sha256 } };
  }

  async getPublic(_pointer: StoragePointer): Promise<Uint8Array> {
    throw new Error("Not implemented");
  }
}
