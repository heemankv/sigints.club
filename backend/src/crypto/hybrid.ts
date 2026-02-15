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
  publicKey: Buffer;
  privateKey: Buffer;
};

export type WrappedKey = {
  subscriberId: string;
  epk: string; // base64
  encKey: string; // base64
  iv: string; // base64
  tag: string; // base64
};

export function generateX25519Keypair(): X25519Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }),
  };
}

export function subscriberIdFromPubkey(pubkeyDer: Buffer): string {
  return createHash("sha256").update(pubkeyDer).digest("hex");
}

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

function deriveSharedKey(ephemeralPrivateDer: Buffer, subscriberPubDer: Buffer): Buffer {
  const ephPrivate = createPrivateKeyFromDer(ephemeralPrivateDer);
  const subPublic = createPublicKeyFromDer(subscriberPubDer);
  const shared = diffieHellman({ privateKey: ephPrivate, publicKey: subPublic });
  return hkdfSha256(shared, Buffer.from("persona-fun-keywrap"), 32);
}

function createPrivateKeyFromDer(der: Buffer) {
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function createPublicKeyFromDer(der: Buffer) {
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

export function encryptSignal(plaintext: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptSignal(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function wrapKeyForSubscriber(subscriberPubDer: Buffer, keyToWrap: Buffer): WrappedKey {
  const { publicKey: epk, privateKey: esk } = generateX25519Keypair();
  const sharedKey = deriveSharedKey(esk, subscriberPubDer);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sharedKey, iv);
  const encKey = Buffer.concat([cipher.update(keyToWrap), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    subscriberId: subscriberIdFromPubkey(subscriberPubDer),
    epk: epk.toString("base64"),
    encKey: encKey.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function unwrapKeyForSubscriber(
  subscriberPrivateDer: Buffer,
  wrapped: WrappedKey
): Buffer {
  const priv = createPrivateKey({ key: subscriberPrivateDer, format: "der", type: "pkcs8" });
  const epk = createPublicKey({ key: Buffer.from(wrapped.epk, "base64"), format: "der", type: "spki" });
  const shared = diffieHellman({ privateKey: priv, publicKey: epk });
  const sharedKey = hkdfSha256(shared, Buffer.from("persona-fun-keywrap"), 32);
  const iv = Buffer.from(wrapped.iv, "base64");
  const tag = Buffer.from(wrapped.tag, "base64");
  const encKey = Buffer.from(wrapped.encKey, "base64");
  const decipher = createDecipheriv("aes-256-gcm", sharedKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encKey), decipher.final()]);
}

export function generateSymmetricKey(): Buffer {
  return randomBytes(32);
}
