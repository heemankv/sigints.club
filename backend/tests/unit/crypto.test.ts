import { describe, expect, it } from "vitest";
import {
  decryptSignal,
  encryptSignal,
  generateSymmetricKey,
  generateX25519Keypair,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
  wrapKeyForSubscriber,
} from "../../src/crypto/hybrid";


describe("crypto/hybrid", () => {
  it("derives deterministic subscriber ids", () => {
    const kp = generateX25519Keypair();
    const id1 = subscriberIdFromPubkey(kp.publicKey);
    const id2 = subscriberIdFromPubkey(kp.publicKey);
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });

  it("wraps and unwraps symmetric keys", () => {
    const kp = generateX25519Keypair();
    const symKey = generateSymmetricKey();
    const wrapped = wrapKeyForSubscriber(kp.publicKey, symKey);
    const unwrapped = unwrapKeyForSubscriber(kp.privateKey, wrapped);
    expect(unwrapped.equals(symKey)).toBe(true);
  });

  it("encrypts and decrypts payloads", () => {
    const key = generateSymmetricKey();
    const payload = Buffer.from("hello-world", "utf8");
    const { ciphertext, iv, tag } = encryptSignal(payload, key);
    const plaintext = decryptSignal(ciphertext, key, iv, tag);
    expect(plaintext.toString("utf8")).toBe("hello-world");
  });
});
