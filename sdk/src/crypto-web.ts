export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function toBase64Bytes(bytes: Uint8Array): string {
  return toBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

export function normalizeBase64(input: string): string {
  const stripped = input
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const normalized = stripped.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return normalized + "=".repeat(padLength);
}

export function fromBase64(b64: string): Uint8Array {
  const normalized = normalizeBase64(b64);
  try {
    return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("Invalid base64 input");
  }
}

const X25519_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);

export function x25519SpkiToRaw(base64Der: string): Uint8Array {
  const bytes = fromBase64(base64Der);
  if (bytes.length === 32) {
    return bytes;
  }
  if (bytes.length === 44) {
    const prefix = bytes.slice(0, X25519_SPKI_PREFIX.length);
    const matches = prefix.every((value, idx) => value === X25519_SPKI_PREFIX[idx]);
    if (matches) {
      return bytes.slice(X25519_SPKI_PREFIX.length);
    }
  }
  throw new Error("Encryption public key must be 32 bytes (base64)");
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateX25519Keypair(): Promise<{ publicKeyBase64: string; privateKeyBase64: string }> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveKey", "deriveBits"]
  )) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  return {
    publicKeyBase64: toBase64(pub),
    privateKeyBase64: toBase64(priv),
  };
}

export async function importX25519PublicKey(base64Der: string): Promise<CryptoKey> {
  const der = fromBase64(base64Der);
  return crypto.subtle.importKey(
    "spki",
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer,
    { name: "X25519" },
    false,
    []
  );
}

export async function importX25519PrivateKey(base64Der: string): Promise<CryptoKey> {
  const der = fromBase64(base64Der);
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer,
    { name: "X25519" },
    false,
    ["deriveKey", "deriveBits"]
  );
}

export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("sigints-keywrap"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

export async function decryptAesGcm(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  tag?: Uint8Array
): Promise<Uint8Array> {
  const payload = tag ? new Uint8Array([...ciphertext, ...tag]) : ciphertext;
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const payloadBuffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuffer }, key, payloadBuffer);
  return new Uint8Array(plain);
}

export async function subscriberIdFromPubkey(base64Der: string): Promise<string> {
  const der = fromBase64(base64Der);
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  return sha256Hex(buf);
}
