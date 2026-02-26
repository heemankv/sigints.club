import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { SignalMetadata } from "./index.js";

export type PrepareSignalInput = {
  streamId: string;
  tierId: string;
  plaintext: string;
  visibility?: "public" | "private";
};

export type PrepareSignalResponse = {
  metadata: SignalMetadata;
};

export type RecordSignalParams = {
  programId: PublicKey;
  streamRegistryProgramId: PublicKey;
  authority: PublicKey;
  streamId?: string;
  streamPubkey?: PublicKey;
  metadata: SignalMetadata;
};

export type RecordSignalDelegatedParams = {
  programId: PublicKey;
  streamRegistryProgramId: PublicKey;
  publisher: PublicKey;
  streamId?: string;
  streamPubkey?: PublicKey;
  metadata: SignalMetadata;
};

const ZERO_32 = new Uint8Array(32);

export async function prepareSignal(backendUrl: string, input: PrepareSignalInput): Promise<SignalMetadata> {
  const payload = {
    streamId: input.streamId,
    tierId: input.tierId,
    visibility: input.visibility ?? "private",
    plaintextBase64: encodeBase64(input.plaintext),
  };
  const res = await fetch(`${backendUrl.replace(/\/$/, "")}/signals/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`signal prepare failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as PrepareSignalResponse;
  return data.metadata;
}

export async function buildRecordSignalInstruction(params: RecordSignalParams): Promise<TransactionInstruction> {
  const streamPubkey =
    params.streamPubkey ??
    (params.streamId
      ? await deriveStreamPda(params.streamRegistryProgramId, params.streamId)
      : null);
  if (!streamPubkey) {
    throw new Error("streamPubkey or streamId is required");
  }

  const signalHash = toBytes32(params.metadata.signalHash, "signalHash");
  const signalPointerHash = toBytes32(
    await sha256Hex(params.metadata.signalPointer),
    "signalPointerHash"
  );
  const keyboxHash = params.metadata.keyboxHash
    ? toBytes32(params.metadata.keyboxHash, "keyboxHash")
    : ZERO_32;
  const keyboxPointerHash = params.metadata.keyboxPointer
    ? toBytes32(await sha256Hex(params.metadata.keyboxPointer), "keyboxPointerHash")
    : ZERO_32;

  const discriminator = await anchorDiscriminator("record_signal");
  const data = new Uint8Array(8 + 32 + 32 + 32 + 32);
  data.set(discriminator, 0);
  data.set(signalHash, 8);
  data.set(signalPointerHash, 40);
  data.set(keyboxHash, 72);
  data.set(keyboxPointerHash, 104);

  const [signalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("signal_latest"), streamPubkey.toBuffer()],
    params.programId
  );
  const [streamState] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_state"), streamPubkey.toBuffer()],
    params.programId
  );

  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: signalPda, isSigner: false, isWritable: true },
      { pubkey: streamPubkey, isSigner: false, isWritable: false },
      { pubkey: params.streamRegistryProgramId, isSigner: false, isWritable: false },
      { pubkey: streamState, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildRecordSignalDelegatedInstruction(
  params: RecordSignalDelegatedParams
): Promise<TransactionInstruction> {
  const streamPubkey =
    params.streamPubkey ??
    (params.streamId
      ? await deriveStreamPda(params.streamRegistryProgramId, params.streamId)
      : null);
  if (!streamPubkey) {
    throw new Error("streamPubkey or streamId is required");
  }

  const signalHash = toBytes32(params.metadata.signalHash, "signalHash");
  const signalPointerHash = toBytes32(
    await sha256Hex(params.metadata.signalPointer),
    "signalPointerHash"
  );
  const keyboxHash = params.metadata.keyboxHash
    ? toBytes32(params.metadata.keyboxHash, "keyboxHash")
    : ZERO_32;
  const keyboxPointerHash = params.metadata.keyboxPointer
    ? toBytes32(await sha256Hex(params.metadata.keyboxPointer), "keyboxPointerHash")
    : ZERO_32;

  const discriminator = await anchorDiscriminator("record_signal_delegated");
  const data = new Uint8Array(8 + 32 + 32 + 32 + 32);
  data.set(discriminator, 0);
  data.set(signalHash, 8);
  data.set(signalPointerHash, 40);
  data.set(keyboxHash, 72);
  data.set(keyboxPointerHash, 104);

  const [signalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("signal_latest"), streamPubkey.toBuffer()],
    params.programId
  );
  const [streamState] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_state"), streamPubkey.toBuffer()],
    params.programId
  );
  const [publisherDelegate] = PublicKey.findProgramAddressSync(
    [Buffer.from("publisher"), streamPubkey.toBuffer(), params.publisher.toBuffer()],
    params.streamRegistryProgramId
  );

  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: signalPda, isSigner: false, isWritable: true },
      { pubkey: streamPubkey, isSigner: false, isWritable: false },
      { pubkey: params.streamRegistryProgramId, isSigner: false, isWritable: false },
      { pubkey: streamState, isSigner: false, isWritable: true },
      { pubkey: publisherDelegate, isSigner: false, isWritable: false },
      { pubkey: params.publisher, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function deriveStreamPda(
  streamRegistryProgramId: PublicKey,
  streamId: string
): Promise<PublicKey> {
  const streamIdBytes = await sha256Bytes(streamId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stream"), Buffer.from(streamIdBytes)],
    streamRegistryProgramId
  )[0];
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto not available for SHA-256");
  }
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return new Uint8Array(hash);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = await sha256Bytes(input);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function anchorDiscriminator(ixName: string): Promise<Uint8Array> {
  const hash = await sha256Bytes(`global:${ixName}`);
  return hash.slice(0, 8);
}

function toBytes32(hex: string, label: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length !== 64) {
    throw new Error(`invalid ${label} hex`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function encodeBase64(input: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(input)));
  }
  return Buffer.from(input, "utf8").toString("base64");
}
