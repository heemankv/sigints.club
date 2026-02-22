import { describe, expect, it } from "vitest";
import {
  decryptSignal,
  generateX25519Keypair,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
} from "../src/crypto";
import {
  createCipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  randomBytes,
} from "node:crypto";

function hkdfSha256(ikm: Buffer, info: Buffer, length = 32): Buffer {
  const prk = createHmac("sha256", Buffer.alloc(32, 0)).update(ikm).digest();
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  let i = 0;
  while (okm.length < length) {
    i += 1;
    const hmac = createHmac("sha256", prk);
    hmac.update(Buffer.concat([t, info, Buffer.from([i]) ]));
    t = hmac.digest();
    okm = Buffer.concat([okm, t]);
  }
  return okm.subarray(0, length);
}

function wrapKeyForSubscriber(subscriberPubDerBase64: string, keyToWrap: Buffer) {
  const kp = generateX25519Keypair();
  const ephPrivate = createPrivateKey({
    key: Buffer.from(kp.privateKeyDerBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const subPublic = createPublicKey({
    key: Buffer.from(subscriberPubDerBase64, "base64"),
    format: "der",
    type: "spki",
  });
  const shared = diffieHellman({ privateKey: ephPrivate, publicKey: subPublic });
  const sharedKey = hkdfSha256(shared, Buffer.from("sigints-keywrap"), 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sharedKey, iv);
  const encKey = Buffer.concat([cipher.update(keyToWrap), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    subscriberId: subscriberIdFromPubkey(subscriberPubDerBase64),
    epk: kp.publicKeyDerBase64,
    encKey: encKey.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}


describe("sdk crypto", () => {
  it("computes deterministic subscriber ids", () => {
    const kp = generateX25519Keypair();
    const id1 = subscriberIdFromPubkey(kp.publicKeyDerBase64);
    const id2 = subscriberIdFromPubkey(kp.publicKeyDerBase64);
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });

  it("unwraps wrapped symmetric keys", () => {
    const subscriber = generateX25519Keypair();
    const symKey = randomBytes(32);
    const wrapped = wrapKeyForSubscriber(subscriber.publicKeyDerBase64, symKey);
    const unwrapped = unwrapKeyForSubscriber(subscriber.privateKeyDerBase64, wrapped);
    expect(unwrapped.equals(symKey)).toBe(true);
  });

  it("decrypts AES-GCM payload", () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from("hello")), cipher.final()]);
    const tag = cipher.getAuthTag();

    const plaintext = decryptSignal(
      ciphertext.toString("base64"),
      key,
      iv.toString("base64"),
      tag.toString("base64")
    );
    expect(plaintext.toString("utf8")).toBe("hello");
  });
});
