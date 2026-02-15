import { describe, expect, it } from "vitest";
import { BackendStorage } from "../../src/storage/providers/BackendStorage";
import { sha256Hex } from "../../src/utils/hash";

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe("BackendStorage", () => {
  it("stores and retrieves ciphertext", async () => {
    const storage = new BackendStorage();
    const payload = toBytes("ciphertext-sample");
    const hash = sha256Hex(payload);
    const { pointer } = await storage.putCiphertext(payload, hash);
    const fetched = await storage.getCiphertext(pointer);
    expect(Buffer.from(fetched).toString("utf8")).toBe("ciphertext-sample");
  });

  it("stores and retrieves keybox", async () => {
    const storage = new BackendStorage();
    const payload = toBytes("keybox-sample");
    const hash = sha256Hex(payload);
    const { pointer } = await storage.putKeybox(payload, hash);
    const fetched = await storage.getKeybox(pointer);
    expect(Buffer.from(fetched).toString("utf8")).toBe("keybox-sample");
  });
});
