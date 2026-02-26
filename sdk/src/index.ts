import { Connection, PublicKey } from "@solana/web3.js";
import {
  decryptSignal,
  generateX25519Keypair,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
  WrappedKey,
  type X25519Keypair,
} from "./crypto.js";
import {
  buildRecordSignalInstruction as buildRecordSignalIx,
  buildRecordSignalDelegatedInstruction as buildRecordSignalDelegatedIx,
  type PrepareSignalInput,
  type RecordSignalParams,
  type RecordSignalDelegatedParams,
} from "./publish.js";
import {
  registerSubscription as registerSubscriptionRequest,
  fetchSolanaConfig as fetchSolanaConfigRequest,
  syncWalletKey as syncWalletKeyRequest,
  fetchStream as fetchStreamRequest,
  prepareSignal as prepareSignalRequest,
  fetchLatestSignal as fetchLatestSignalRequest,
  fetchSignalByHash as fetchSignalByHashRequest,
  fetchCiphertext as fetchCiphertextRequest,
  fetchPublicPayload as fetchPublicPayloadRequest,
  fetchKeyboxEntry as fetchKeyboxEntryRequest,
  type SubscribeResponse,
  type SyncWalletKeyResponse,
  type LoginUserResponse,
  type PublicPayloadAuth,
} from "./backend.js";

export type OrbitflareConfig = {
  rpcUrl?: string;
  jetstreamEndpoint?: string;
  apiKey?: string;
  apiKeyHeader?: string;
};

export type StreamSdkConfig = {
  rpcUrl?: string;
  backendUrl: string;
  programId: string;
  streamRegistryProgramId?: string;
  keyboxAuth?: KeyboxAuth;
  agentAuth?: AgentAuth;
  orbitflare?: OrbitflareConfig;
};

export type KeyboxAuth = {
  walletPubkey: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array> | Uint8Array;
};

export type AgentAuth = {
  agentId: string;
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

export type Signal = {
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
  onSignal: (signal: Signal) => void | Promise<void>;
  onError?: (error: Error) => void;
  maxAgeMs?: number;
  includeBlockTime?: boolean;
  transport?: "auto" | "jetstream" | "websocket";
};

export class SigintsClient {
  private connection: Connection;
  private programId: PublicKey;
  private streamRegistryProgramId?: PublicKey;
  private backendUrl: string;
  private keyboxAuth?: KeyboxAuth;
  private agentAuth?: AgentAuth;
  private orbitflare?: OrbitflareConfig;
  private seenSignals = new Set<string>();

  constructor(cfg: StreamSdkConfig) {
    const resolvedRpcUrl = cfg.orbitflare?.rpcUrl ?? cfg.rpcUrl;
    if (!resolvedRpcUrl) {
      throw new Error("rpcUrl is required to initialize SigintsClient");
    }
    this.connection = new Connection(resolvedRpcUrl, "confirmed");
    this.programId = new PublicKey(cfg.programId);
    this.streamRegistryProgramId = cfg.streamRegistryProgramId
      ? new PublicKey(cfg.streamRegistryProgramId)
      : undefined;
    this.backendUrl = cfg.backendUrl.replace(/\/$/, "");
    this.keyboxAuth = cfg.keyboxAuth;
    this.agentAuth = cfg.agentAuth;
    this.orbitflare = cfg.orbitflare;
  }

  static async fromBackend(
    backendUrl: string,
    options?: { keyboxAuth?: KeyboxAuth; agentAuth?: AgentAuth; orbitflare?: OrbitflareConfig }
  ): Promise<SigintsClient> {
    const config = await fetchSolanaConfigRequest(backendUrl);
    return new SigintsClient({
      rpcUrl: options?.orbitflare?.rpcUrl ?? config.rpcUrl,
      backendUrl,
      programId: config.subscriptionProgramId,
      streamRegistryProgramId: config.streamRegistryProgramId,
      keyboxAuth: options?.keyboxAuth,
      agentAuth: options?.agentAuth,
      orbitflare: options?.orbitflare,
    });
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
    const resp = await syncWalletKeyRequest(this.backendUrl, {
      wallet: subscriberWallet,
      streamId,
      encPubKeyDerBase64: publicKeyDerBase64,
    });
    return resp.subscriberId;
  }

  async registerSubscription(streamId: string, subscriberWallet: string): Promise<SubscribeResponse> {
    return registerSubscriptionRequest(this.backendUrl, { streamId, subscriberWallet });
  }

  async syncWalletKey(
    wallet: string,
    streamId: string,
    encPubKeyDerBase64?: string
  ): Promise<SyncWalletKeyResponse> {
    return syncWalletKeyRequest(this.backendUrl, { wallet, streamId, encPubKeyDerBase64 });
  }

  async fetchStream<T = any>(streamId: string): Promise<T> {
    return fetchStreamRequest<T>(this.backendUrl, streamId);
  }

  async fetchLatestSignal(streamId: string): Promise<SignalMetadata | null> {
    try {
      const data = await fetchLatestSignalRequest<SignalMetadata>(this.backendUrl, streamId);
      return normalizeMetadata(data.signal);
    } catch (err: any) {
      if (typeof err?.message === "string" && err.message.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  async fetchSignalByHash(signalHash: string): Promise<SignalMetadata> {
    const data = await fetchSignalByHashRequest<SignalMetadata>(this.backendUrl, signalHash);
    return normalizeMetadata(data.signal);
  }

  async fetchCiphertext(pointer: string): Promise<SignalPayload> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid signal pointer");
    }
    const data = await fetchCiphertextRequest<SignalPayload>(this.backendUrl, sha);
    return data.payload;
  }

  async fetchPublic(pointer: string): Promise<PublicSignalPayload> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid public signal pointer");
    }
    const auth = await this.buildPublicAuth(sha);
    const data = await fetchPublicPayloadRequest<PublicSignalPayload>(this.backendUrl, sha, auth);
    return data.payload;
  }

  async fetchKeyboxEntry(pointer: string, encPubKeyDerBase64: string): Promise<WrappedKey> {
    const sha = pointer.split("/").pop();
    if (!sha) {
      throw new Error("invalid keybox pointer");
    }
    const message = Buffer.from(`sigints:keybox:${sha}`, "utf8");
    if (this.keyboxAuth) {
      const signatureBytes = await Promise.resolve(this.keyboxAuth.signMessage(message));
      const signatureBase64 = Buffer.from(signatureBytes).toString("base64");
      const data = await fetchKeyboxEntryRequest<WrappedKey>(this.backendUrl, sha, {
        wallet: this.keyboxAuth.walletPubkey,
        signatureBase64,
        encPubKeyDerBase64,
      });
      return data.entry;
    }
    if (this.agentAuth) {
      const signatureBytes = await Promise.resolve(this.agentAuth.signMessage(message));
      const signatureBase64 = Buffer.from(signatureBytes).toString("base64");
      const data = await fetchKeyboxEntryRequest<WrappedKey>(this.backendUrl, sha, {
        agentId: this.agentAuth.agentId,
        signatureBase64,
        encPubKeyDerBase64,
      });
      return data.entry;
    }
    throw new Error("keybox auth or agent auth not configured");
  }

  async decryptSignal(meta: SignalMetadata, keys?: SubscriberKeys): Promise<string> {
    const visibility = meta.visibility ?? "private";
    if (visibility === "public") {
      const payload = await this.fetchPublic(meta.signalPointer);
      return Buffer.from(payload.plaintext, "base64").toString("utf8");
    }
    if (!keys) {
      throw new Error("subscriber keys required for private stream signals");
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
    const transport = options.transport ?? "auto";

    if (transport === "websocket") {
      return this.listenForSignalsWebsocket(options);
    }

    if (transport === "jetstream") {
      return this.listenForSignalsJetstream(options);
    }

    const jetstreamEndpoint = this.orbitflare?.jetstreamEndpoint;
    if (jetstreamEndpoint && typeof window === "undefined") {
      try {
        return await this.listenForSignalsJetstream(options);
      } catch (err: any) {
        if (options.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    return this.listenForSignalsWebsocket(options);
  }

  private async listenForSignalsWebsocket(options: ListenOptions): Promise<() => void> {
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
          await this.handleDecodedSignal(options, decoded, ctx.slot);
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

  private async listenForSignalsJetstream(options: ListenOptions): Promise<() => void> {
    if (!this.orbitflare?.jetstreamEndpoint) {
      throw new Error("Jetstream endpoint not configured");
    }
    if (typeof window !== "undefined") {
      throw new Error("Jetstream is not supported in browser environments");
    }

    const stream = new PublicKey(options.streamPubkey);
    const [signalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signal_latest"), stream.toBuffer()],
      this.programId
    );

    const { startJetstreamAccountListener } = await import("./jetstream");
    const subscription = await startJetstreamAccountListener({
      endpoint: this.orbitflare.jetstreamEndpoint,
      apiKey: this.orbitflare.apiKey,
      apiKeyHeader: this.orbitflare.apiKeyHeader,
      accountPubkey: signalPda.toBase58(),
      onAccount: async (update) => {
        const decoded = decodeSignalRecord(update.data);
        if (!decoded) return;
        if (decoded.stream !== stream.toBase58()) return;
        await this.handleDecodedSignal(options, decoded, update.slot);
      },
      onError: options.onError,
    });

    return () => subscription.close();
  }

  private async handleDecodedSignal(
    options: ListenOptions,
    decoded: DecodedSignalRecord,
    slot?: number
  ): Promise<void> {
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
    const blockTime = options.includeBlockTime && slot !== undefined
      ? await this.connection.getBlockTime(slot)
      : undefined;
    await options.onSignal({
      signalHash: decoded.signalHash,
      metadata: meta,
      plaintext,
      slot: slot ?? 0,
      createdAt,
      receivedAt,
      ageMs,
      blockTime,
    });
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

  async prepareSignal(input: PrepareSignalInput): Promise<SignalMetadata> {
    return prepareSignalRequest(this.backendUrl, input);
  }

  async buildRecordSignalInstruction(params: Omit<RecordSignalParams, "programId" | "streamRegistryProgramId">): Promise<import("@solana/web3.js").TransactionInstruction> {
    if (!this.streamRegistryProgramId) {
      throw new Error("streamRegistryProgramId not configured");
    }
    return buildRecordSignalIx({
      ...params,
      programId: this.programId,
      streamRegistryProgramId: this.streamRegistryProgramId,
    });
  }

  async buildRecordSignalDelegatedInstruction(
    params: Omit<RecordSignalDelegatedParams, "programId" | "streamRegistryProgramId">
  ): Promise<import("@solana/web3.js").TransactionInstruction> {
    if (!this.streamRegistryProgramId) {
      throw new Error("streamRegistryProgramId not configured");
    }
    return buildRecordSignalDelegatedIx({
      ...params,
      programId: this.programId,
      streamRegistryProgramId: this.streamRegistryProgramId,
    });
  }

  private async buildPublicAuth(sha: string): Promise<PublicPayloadAuth> {
    const message = new TextEncoder().encode(`sigints:public:${sha}`);
    if (this.agentAuth) {
      const signatureBytes = await Promise.resolve(this.agentAuth.signMessage(message));
      const signatureBase64 = Buffer.from(signatureBytes).toString("base64");
      return { agentId: this.agentAuth.agentId, signatureBase64 };
    }
    if (this.keyboxAuth) {
      const signatureBytes = await Promise.resolve(this.keyboxAuth.signMessage(message));
      const signatureBase64 = Buffer.from(signatureBytes).toString("base64");
      return { wallet: this.keyboxAuth.walletPubkey, signatureBase64 };
    }
    throw new Error("public payload auth not configured");
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

export * from "./tradeIntent.js";

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

export { decryptSignal, generateX25519Keypair, subscriberIdFromPubkey, unwrapKeyForSubscriber };
export type { WrappedKey, X25519Keypair };
export {
  buildRecordSignalIx as buildRecordSignalInstruction,
  buildRecordSignalDelegatedIx as buildRecordSignalDelegatedInstruction,
  registerSubscriptionRequest as registerSubscription,
  syncWalletKeyRequest as syncWalletKey,
  fetchStreamRequest as fetchStream,
};
export type { PrepareSignalInput, RecordSignalParams, RecordSignalDelegatedParams } from "./publish.js";

export {
  getJson,
  postJson,
  deleteJson,
  createBackendClient,
  fetchSolanaConfig,
  fetchStreams,
  fetchStreamSubscribers,
  createStream,
  fetchOnchainSubscriptions,
  fetchSignals,
  fetchSignalEvents,
  fetchLatestSignal,
  fetchSignalByHash,
  fetchCiphertext,
  fetchPublicPayload,
  buildPublicPayloadMessage,
  fetchKeyboxEntry,
  fetchHealth,
  getTestWallet,
  testWalletSend,
  testWalletSignMessage,
  deleteComment,
  deletePost,
  fetchFeed,
  fetchFollowingFeed,
  fetchTrendingFeed,
  fetchPost,
  prepareSignal,
  createIntent,
  createSlashReport,
  addLike,
  removeLike,
  fetchLikeCount,
  fetchFollowCounts,
  fetchFollowingIds,
  fetchComments,
  addComment,
  followProfile,
  searchAgents,
  fetchAgents,
  createAgent,
  createAgentSubscription,
  fetchAgentSubscriptions,
  deleteAgentSubscription,
  fetchUserProfile,
  loginUser,
  type LoginUserResponse,
  type PublicPayloadAuth,
} from "./backend.js";

export * from "./solana/index.js";
export * from "./transactions.js";

export const __testing = {
  decodeSignalRecord,
  normalizeCreatedAt,
  normalizeMetadata,
  hexToBytes,
};
