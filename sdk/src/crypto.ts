import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";

export type X25519Keypair = {
  publicKeyDerBase64: string;
  privateKeyDerBase64: string;
};

export type WrappedKey = {
  subscriberId: string;
  epk: string;
  encKey: string;
  iv: string;
  tag: string;
};

export function generateX25519Keypair(): X25519Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKeyDerBase64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyDerBase64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export function subscriberIdFromPubkey(pubkeyDerBase64: string): string {
  const pub = Buffer.from(pubkeyDerBase64, "base64");
  return createHash("sha256").update(pub).digest("hex");
}

function hkdfSha256(ikm: Buffer, info: Buffer, length = 32): Buffer {
  const prk = createHmac("sha256", Buffer.alloc(32, 0)).update(ikm).digest();
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  let i = 0;
  while (okm.length < length) {
    i += 1;
    const hmac = createHmac("sha256", prk);
    hmac.update(Buffer.concat([t, info, Buffer.from([i])]));
    t = hmac.digest();
    okm = Buffer.concat([okm, t]);
  }
  return okm.subarray(0, length);
}

function deriveSharedKey(ephemeralPrivateDer: Buffer, subscriberPubDer: Buffer): Buffer {
  const ephPrivate = createPrivateKey({ key: ephemeralPrivateDer, format: "der", type: "pkcs8" });
  const subPublic = createPublicKey({ key: subscriberPubDer, format: "der", type: "spki" });
  const shared = diffieHellman({ privateKey: ephPrivate, publicKey: subPublic });
  return hkdfSha256(shared, Buffer.from("persona-fun-keywrap"), 32);
}

export function unwrapKeyForSubscriber(
  subscriberPrivateDerBase64: string,
  wrapped: WrappedKey
): Buffer {
  const priv = createPrivateKey({
    key: Buffer.from(subscriberPrivateDerBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const epk = createPublicKey({
    key: Buffer.from(wrapped.epk, "base64"),
    format: "der",
    type: "spki",
  });
  const shared = diffieHellman({ privateKey: priv, publicKey: epk });
  const sharedKey = hkdfSha256(shared, Buffer.from("persona-fun-keywrap"), 32);
  const iv = Buffer.from(wrapped.iv, "base64");
  const tag = Buffer.from(wrapped.tag, "base64");
  const encKey = Buffer.from(wrapped.encKey, "base64");
  const decipher = createDecipheriv("aes-256-gcm", sharedKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encKey), decipher.final()]);
}

export function decryptSignal(
  ciphertextBase64: string,
  symKey: Buffer,
  ivBase64: string,
  tagBase64: string
): Buffer {
  const ciphertext = Buffer.from(ciphertextBase64, "base64");
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", symKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
