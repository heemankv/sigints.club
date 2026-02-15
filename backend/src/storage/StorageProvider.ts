export type StoragePointer = {
  id: string;
  url?: string;
  sha256: string;
};

export type StoreResult = {
  pointer: StoragePointer;
};

export interface StorageProvider {
  putCiphertext(payload: Uint8Array, sha256: string): Promise<StoreResult>;
  getCiphertext(pointer: StoragePointer): Promise<Uint8Array>;

  putKeybox(payload: Uint8Array, sha256: string): Promise<StoreResult>;
  getKeybox(pointer: StoragePointer): Promise<Uint8Array>;
}
