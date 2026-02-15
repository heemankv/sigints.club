import { Connection, PublicKey } from "@solana/web3.js";
import {
  decryptSignal,
  generateX25519Keypair,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
  WrappedKey,
} from "./crypto";

export type PersonaSdkConfig = {
  rpcUrl: string;
  backendUrl: string;
  programId: string;
};

export type SubscriberKeys = {
  publicKeyDerBase64: string;
  privateKeyDerBase64: string;
};

export type SignalMetadata = {
  personaId: string;
  tierId: string;
  signalHash: string;
  signalPointer: string;
  keyboxHash: string;
  keyboxPointer: string;
  createdAt: number;
  onchainTx?: string;
};

export type SignalPayload = {
  iv: string;
  tag: string;
  ciphertext: string;
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
  personaPubkey: string;
  personaId: string;
  subscriberKeys: SubscriberKeys;
  onSignal: (tick: SignalTick) => void | Promise<void>;
  onError?: (error: Error) => void;
  maxAgeMs?: number;
  includeBlockTime?: boolean;
};

export class PersonaClient {
  private connection: Connection;
  private programId: PublicKey;
  private backendUrl: string;
  private seenSignals = new Set<string>();

  constructor(cfg: PersonaSdkConfig) {
    this.connection = new Connection(cfg.rpcUrl, "confirmed");
    this.programId = new PublicKey(cfg.programId);
    this.backendUrl = cfg.backendUrl.replace(/\/$/, "");
  }

  static generateKeys() {
    return generateX25519Keypair();
  }

  async registerEncryptionKey(personaId: string, publicKeyDerBase64: string): Promise<string> {
    const res = await fetch(`${this.backendUrl}/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId, encPubKeyDerBase64: publicKeyDerBase64 }),
    });
    if (!res.ok) {
      throw new Error(`backend subscribe failed (${res.status})`);
    }
    const data = (await res.json()) as { subscriberId: string };
    return data.subscriberId;
  }

  async fetchLatestSignal(personaId: string): Promise<SignalMetadata | null> {
    const res = await fetch(`${this.backendUrl}/signals/latest?personaId=${encodeURIComponent(personaId)}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`backend latest signal failed (${res.status})`);
    }
    const data = (await res.json()) as { signal: SignalMetadata };
    return data.signal;
  }

  async fetchSignalByHash(signalHash: string): Promise<SignalMetadata> {
    const res = await fetch(`${this.backendUrl}/signals/by-hash/${signalHash}`);
    if (!res.ok) {
      throw new Error(`backend signal lookup failed (${res.status})`);
    }
    const data = (await res.json()) as { signal: SignalMetadata };
    return data.signal;
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

  async fetchKeyboxEntry(pointer: string, subscriberId: string): Promise<WrappedKey> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid keybox pointer");
    }
    const res = await fetch(
      `${this.backendUrl}/storage/keybox/${sha}?subscriberId=${encodeURIComponent(subscriberId)}`
    );
    if (!res.ok) {
      throw new Error(`keybox fetch failed (${res.status})`);
    }
    const data = (await res.json()) as { entry: WrappedKey };
    return data.entry;
  }

  async decryptSignal(meta: SignalMetadata, keys: SubscriberKeys): Promise<string> {
    const subscriberId = subscriberIdFromPubkey(keys.publicKeyDerBase64);
    const wrapped = await this.fetchKeyboxEntry(meta.keyboxPointer, subscriberId);
    const symKey = unwrapKeyForSubscriber(keys.privateKeyDerBase64, wrapped);
    const payload = await this.fetchCiphertext(meta.signalPointer);
    const plaintext = decryptSignal(payload.ciphertext, symKey, payload.iv, payload.tag);
    return plaintext.toString("utf8");
  }

  async listenForSignals(options: ListenOptions): Promise<() => void> {
    const persona = new PublicKey(options.personaPubkey);
    const filters = [
      { memcmp: { offset: 8, bytes: persona.toBase58() } },
    ];

    const subId = this.connection.onProgramAccountChange(
      this.programId,
      async (accountInfo, ctx) => {
        try {
          const decoded = decodeSignalRecord(accountInfo.accountInfo.data);
          if (!decoded) return;
          if (decoded.persona !== persona.toBase58()) return;
          if (this.seenSignals.has(decoded.signalHash)) return;
          this.seenSignals.add(decoded.signalHash);

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
      "confirmed",
      filters
    );

    return () => {
      void this.connection.removeProgramAccountChangeListener(subId);
    };
  }

  async fetchSignalRecordCreatedAt(personaPubkey: string, signalHash: string): Promise<number | null> {
    const persona = new PublicKey(personaPubkey);
    const signalHashBytes = hexToBytes(signalHash, "signalHash");
    const [signalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signal"), persona.toBuffer(), Buffer.from(signalHashBytes)],
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
  persona: string;
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
  const persona = new PublicKey(data.subarray(offset, offset + 32));
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
    persona: persona.toBase58(),
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
