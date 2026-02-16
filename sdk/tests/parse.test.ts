import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { __testing } from "../src/index";

function writeBigInt64LE(buffer: Uint8Array, value: bigint, offset: number) {
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    buffer[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

describe("sdk parsing", () => {
  it("normalizes created_at seconds to ms", () => {
    const seconds = 1_700_000_000; // seconds
    const ms = __testing.normalizeCreatedAt(seconds);
    expect(ms).toBe(seconds * 1000);
  });

  it("decodes signal record layout", () => {
    const persona = new PublicKey("11111111111111111111111111111111");
    const signalHash = Buffer.alloc(32, 1);
    const signalPointerHash = Buffer.alloc(32, 2);
    const keyboxHash = Buffer.alloc(32, 3);
    const keyboxPointerHash = Buffer.alloc(32, 4);
    const createdAtMs = 1_700_000_000_000n;
    const bump = 7;

    const data = Buffer.alloc(8 + 32 + 32 + 32 + 32 + 32 + 8 + 1);
    let offset = 8; // discriminator ignored
    persona.toBuffer().copy(data, offset);
    offset += 32;
    signalHash.copy(data, offset);
    offset += 32;
    signalPointerHash.copy(data, offset);
    offset += 32;
    keyboxHash.copy(data, offset);
    offset += 32;
    keyboxPointerHash.copy(data, offset);
    offset += 32;
    writeBigInt64LE(data, createdAtMs, offset);
    offset += 8;
    data[offset] = bump;

    const decoded = __testing.decodeSignalRecord(data);
    expect(decoded).not.toBeNull();
    expect(decoded?.persona).toBe(persona.toBase58());
    expect(decoded?.createdAt).toBe(Number(createdAtMs));
  });
});
