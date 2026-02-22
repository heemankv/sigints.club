import { promises as fs } from "node:fs";
import path from "node:path";
import { StoragePointer, StorageProvider, StoreResult } from "../StorageProvider";

export class BackendStorage implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), "storage");
  }

  async putCiphertext(payload: Uint8Array, sha256: string): Promise<StoreResult> {
    const dir = path.join(this.baseDir, "ciphertext");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${sha256}.bin`);
    await fs.writeFile(filePath, payload);
    return { pointer: { id: `backend://ciphertext/${sha256}`, sha256 } };
  }

  async getCiphertext(pointer: StoragePointer): Promise<Uint8Array> {
    const sha = this.extractSha(pointer.id, "ciphertext");
    const filePath = path.join(this.baseDir, "ciphertext", `${sha}.bin`);
    return fs.readFile(filePath);
  }

  async putKeybox(payload: Uint8Array, sha256: string): Promise<StoreResult> {
    const dir = path.join(this.baseDir, "keybox");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${sha256}.bin`);
    await fs.writeFile(filePath, payload);
    return { pointer: { id: `backend://keybox/${sha256}`, sha256 } };
  }

  async getKeybox(pointer: StoragePointer): Promise<Uint8Array> {
    const sha = this.extractSha(pointer.id, "keybox");
    const filePath = path.join(this.baseDir, "keybox", `${sha}.bin`);
    return fs.readFile(filePath);
  }

  async putPublic(payload: Uint8Array, sha256: string): Promise<StoreResult> {
    const dir = path.join(this.baseDir, "public");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${sha256}.bin`);
    await fs.writeFile(filePath, payload);
    return { pointer: { id: `backend://public/${sha256}`, sha256 } };
  }

  async getPublic(pointer: StoragePointer): Promise<Uint8Array> {
    const sha = this.extractSha(pointer.id, "public");
    const filePath = path.join(this.baseDir, "public", `${sha}.bin`);
    return fs.readFile(filePath);
  }

  private extractSha(pointerId: string, kind: "ciphertext" | "keybox" | "public"): string {
    const prefix = `backend://${kind}/`;
    if (!pointerId.startsWith(prefix)) {
      throw new Error(`Invalid pointer id: ${pointerId}`);
    }
    return pointerId.slice(prefix.length);
  }
}
