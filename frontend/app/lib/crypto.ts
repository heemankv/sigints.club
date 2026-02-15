export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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
    ["deriveKey"]
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
    ["deriveKey"]
  );
}

export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "X25519", public: publicKey },
    privateKey,
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
