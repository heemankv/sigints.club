import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/utils/hash";


describe("utils/hash", () => {
  it("computes stable sha256 hex", () => {
    const hash = sha256Hex(Buffer.from("abc"));
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
