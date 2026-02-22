import { Connection, PublicKey } from "@solana/web3.js";
import {
  decryptSignal,
  generateX25519Keypair,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
  WrappedKey,
} from "./crypto";

export type StreamSdkConfig = {
  rpcUrl: string;
  backendUrl: string;
  programId: string;
  keyboxAuth?: KeyboxAuth;
};

export type KeyboxAuth = {
  walletPubkey: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array> | Uint8Array;
};

export type SubscriberKeys = {
  publicKeyDerBase64: string;
  privateKeyDerBase64: string;
};

export type SignalMetadata = {
  streamId: string;
  tierId: string;
  signalHash: string;
  signalPointer: string;
  keyboxHash?: string | null;
  keyboxPointer?: string | null;
  visibility?: "public" | "private";
  createdAt: number;
  onchainTx?: string;
};

export type SignalPayload = {
  iv: string;
  tag: string;
  ciphertext: string;
};

export type PublicSignalPayload = {
  plaintext: string;
};

export type SignalTick = {
  signalHash: string;
  metadata: SignalMetadata;
  plaintext: string;
  slot: number;
  createdAt: number;
  receivedAt: number;
  ageMs: number;
  blockTime?: number | null;
};

export type ListenOptions = {
  streamPubkey: string;
  streamId: string;
  subscriberKeys?: SubscriberKeys;
  onSignal: (tick: SignalTick) => void | Promise<void>;
  onError?: (error: Error) => void;
  maxAgeMs?: number;
  includeBlockTime?: boolean;
};

export class SigintsClient {
  private connection: Connection;
  private programId: PublicKey;
  private backendUrl: string;
  private keyboxAuth?: KeyboxAuth;
  private seenSignals = new Set<string>();

  constructor(cfg: StreamSdkConfig) {
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.programId = new PublicKey(cfg.programId);
    this.backendUrl = cfg.backendUrl.replace(/\/$/, "");
    this.keyboxAuth = cfg.keyboxAuth;
  }

  static generateKeys() {
    return generateX25519Keypair();
  }

  async registerEncryptionKey(
    streamId: string,
    publicKeyDerBase64: string,
    subscriberWallet?: string
  ): Promise<string> {
    if (!subscriberWallet) {
      throw new Error("subscriberWallet is required to register encryption key");
    }
    const res = await fetch(`${this.backendUrl}/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        streamId,
        encPubKeyDerBase64: publicKeyDerBase64,
        subscriberWallet,
      }),
    });
    if (!res.ok) {
      throw new Error(`backend subscribe failed (${res.status})`);
    }
    const data = (await res.json()) as { subscriberId: string };
    return data.subscriberId;
  }

  async fetchLatestSignal(streamId: string): Promise<SignalMetadata | null> {
    const res = await fetch(`${this.backendUrl}/signals/latest?streamId=${encodeURIComponent(streamId)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`backend latest signal failed (${res.status})`);
    }
    const data = (await res.json()) as { signal: SignalMetadata };
    return normalizeMetadata(data.signal);
  }

  async fetchSignalByHash(signalHash: string): Promise<SignalMetadata> {
    const res = await fetch(`${this.backendUrl}/signals/by-hash/${signalHash}`);
    if (!res.ok) {
      throw new Error(`backend signal lookup failed (${res.status})`);
    }
    const data = (await res.json()) as { signal: SignalMetadata };
    return normalizeMetadata(data.signal);
  }

  async fetchCiphertext(pointer: string): Promise<SignalPayload> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid signal pointer");
    }
    const res = await fetch(`${this.backendUrl}/storage/ciphertext/${sha}`);
    if (!res.ok) {
      throw new Error(`ciphertext fetch failed (${res.status})`);
    }
    const data = (await res.json()) as { payload: SignalPayload };
    return data.payload;
  }

  async fetchPublic(pointer: string): Promise<PublicSignalPayload> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid public signal pointer");
    }
    const res = await fetch(`${this.backendUrl}/storage/public/${sha}`);
    if (!res.ok) {
      throw new Error(`public payload fetch failed (${res.status})`);
    }
    const data = (await res.json()) as { payload: PublicSignalPayload };
    return data.payload;
  }

  async fetchKeyboxEntry(pointer: string, encPubKeyDerBase64: string): Promise<WrappedKey> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid keybox pointer");
    }
    if (!this.keyboxAuth) {
      throw new Error("keybox auth not configured");
    }
    const message = Buffer.from(`sigints:keybox:${sha}`, "utf8");
    const signatureBytes = await Promise.resolve(this.keyboxAuth.signMessage(message));
    const signatureBase64 = Buffer.from(signatureBytes).toString("base64");
    const res = await fetch(
      `${this.backendUrl}/storage/keybox/${sha}` +
        `?wallet=${encodeURIComponent(this.keyboxAuth.walletPubkey)}` +
        `&signature=${encodeURIComponent(signatureBase64)}` +
        `&encPubKeyDerBase64=${encodeURIComponent(encPubKeyDerBase64)}`
    );
    if (!res.ok) {
      throw new Error(`keybox fetch failed (${res.status})`);
    }
    const data = (await res.json()) as { entry: WrappedKey };
    return data.entry;
  }

  async decryptSignal(meta: SignalMetadata, keys?: SubscriberKeys): Promise<string> {
    const visibility = meta.visibility ?? "private";
    if (visibility === "public") {
      const payload = await this.fetchPublic(meta.signalPointer);
      return Buffer.from(payload.plaintext, "base64").toString("utf8");
    }
    if (!keys) {
      throw new Error("subscriber keys required for private signals");
    }
    if (!meta.keyboxPointer) {
      throw new Error("keybox pointer missing for private signal");
    }
    const wrapped = await this.fetchKeyboxEntry(meta.keyboxPointer, keys.publicKeyDerBase64);
    const symKey = unwrapKeyForSubscriber(keys.privateKeyDerBase64, wrapped);
    const payload = await this.fetchCiphertext(meta.signalPointer);
    const plaintext = decryptSignal(payload.ciphertext, symKey, payload.iv, payload.tag);
    return plaintext.toString("utf8");
  }

  async listenForSignals(options: ListenOptions): Promise<() => void> {
    const stream = new PublicKey(options.streamPubkey);
    const [signalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signal_latest"), stream.toBuffer()],
      this.programId
    );

    const subId = this.connection.onAccountChange(
      signalPda,
      async (accountInfo, ctx) => {
        try {
          const decoded = decodeSignalRecord(accountInfo.data);
          if (!decoded) return;
          if (decoded.stream !== stream.toBase58()) return;
          const dedupeKey = `${decoded.stream}:${decoded.signalHash}:${decoded.createdAt}`;
          if (this.seenSignals.has(dedupeKey)) return;
          this.seenSignals.add(dedupeKey);

          const meta = await this.waitForMetadata(decoded.signalHash);
          if (!meta) return;

          const receivedAt = Date.now();
          const createdAt = decoded.createdAt;
          const ageMs = receivedAt - createdAt;
          if (options.maxAgeMs && ageMs > options.maxAgeMs) {
            return;
          }

          const plaintext = await this.decryptSignal(meta, options.subscriberKeys);
          const blockTime = options.includeBlockTime
            ? await this.connection.getBlockTime(ctx.slot)
            : undefined;
          await options.onSignal({
            signalHash: decoded.signalHash,
            metadata: meta,
            plaintext,
            slot: ctx.slot,
            createdAt,
            receivedAt,
            ageMs,
            blockTime,
          });
        } catch (err: any) {
          if (options.onError) {
            options.onError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      },
      "confirmed"
    );

    return () => {
      void this.connection.removeProgramAccountChangeListener(subId);
    };
  }

  async fetchSignalRecordCreatedAt(streamPubkey: string, _signalHash: string): Promise<number | null> {
    const stream = new PublicKey(streamPubkey);
    const [signalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signal_latest"), stream.toBuffer()],
      this.programId
    );
    const account = await this.connection.getAccountInfo(signalPda, "confirmed");
    if (!account) return null;
    const decoded = decodeSignalRecord(account.data);
    return decoded ? decoded.createdAt : null;
  }

  private async waitForMetadata(signalHash: string): Promise<SignalMetadata | null> {
    const retries = 5;
    const delayMs = 800;
    for (let i = 0; i < retries; i += 1) {
      try {
        return await this.fetchSignalByHash(signalHash);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return null;
  }
}

type DecodedSignalRecord = {
  stream: string;
  signalHash: string;
  signalPointerHash: string;
  keyboxHash: string;
  keyboxPointerHash: string;
  createdAt: number;
  bump: number;
};

function decodeSignalRecord(data: Buffer): DecodedSignalRecord | null {
  if (data.length < 177) {
    return null;
  }
  let offset = 8;
  const stream = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const signalHash = data.subarray(offset, offset + 32);
  offset += 32;
  const signalPointerHash = data.subarray(offset, offset + 32);
  offset += 32;
  const keyboxHash = data.subarray(offset, offset + 32);
  offset += 32;
  const keyboxPointerHash = data.subarray(offset, offset + 32);
  offset += 32;
  const createdAtRaw = Number(data.readBigInt64LE(offset));
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    stream: stream.toBase58(),
    signalHash: signalHash.toString("hex"),
    signalPointerHash: signalPointerHash.toString("hex"),
    keyboxHash: keyboxHash.toString("hex"),
    keyboxPointerHash: keyboxPointerHash.toString("hex"),
    createdAt: normalizeCreatedAt(createdAtRaw),
    bump,
  };
}

function normalizeCreatedAt(createdAt: number): number {
  if (createdAt < 1_000_000_000_000) {
    return createdAt * 1000;
  }
  return createdAt;
}

function normalizeMetadata(meta: SignalMetadata): SignalMetadata {
  const visibility = meta.visibility === "public" ? "public" : "private";
  return {
    ...meta,
    visibility,
    keyboxHash: meta.keyboxHash ?? null,
    keyboxPointer: meta.keyboxPointer ?? null,
  };
}

function hexToBytes(input: string, label: string): Uint8Array {
  const clean = input.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`invalid ${label} hex`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export { generateX25519Keypair, subscriberIdFromPubkey, WrappedKey };

export const __testing = {
  decodeSignalRecord,
  normalizeCreatedAt,
  normalizeMetadata,
  hexToBytes,
};
