import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { SigintsClient, __testing as sdkTesting, subscriberIdFromPubkey } from "../../sdk/src/index.ts";
import { webcrypto } from "node:crypto";
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import {
  decodeSubscriptionAccount,
  deriveStreamState,
  deriveSubscriptionMint,
  deriveSubscriptionPda,
} from "../../frontend/app/lib/solana.ts";

// Ensure WebCrypto available for subscribe instruction builder
if (!globalThis.crypto) {
  // @ts-expect-error test shim
  globalThis.crypto = webcrypto;
}

const RPC_URL = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey(
  process.env.E2E_PROGRAM_ID ??
    process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID ??
    "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE"
);
const STREAM_REGISTRY_PROGRAM_ID = new PublicKey(
  process.env.E2E_STREAM_REGISTRY_PROGRAM_ID ??
    process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID ??
    "5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi"
);
const UPSERT_TIER_DISCRIMINATOR = new Uint8Array([238, 232, 181, 0, 157, 149, 0, 202]);
const RUN_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
const TEST_STREAMS = [
  {
    key: "eth",
    id: `stream-eth-${RUN_ID}`,
    tierId: "trust",
    pricingType: 1,
    evidenceLevel: 0,
    priceLamports: 50_000_000,
    quota: 0,
  },
  {
    key: "anime",
    id: `stream-anime-${RUN_ID}`,
    tierId: "verifier",
    pricingType: 1,
    evidenceLevel: 1,
    priceLamports: 20_000_000,
    quota: 0,
  },
  {
    key: "news",
    id: `stream-news-${RUN_ID}`,
    tierId: "trust",
    pricingType: 1,
    evidenceLevel: 0,
    priceLamports: 10_000_000,
    quota: 0,
  },
];

let connection: Connection;
let server: Server;
let baseUrl: string;
let tempKeypairPath: string;
let authorityKeypair: Keypair;

function loadKeypairFromFile(filePath: string): Keypair {
  const raw = readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function airdrop(connection: Connection, pubkey: PublicKey, sol = 3) {
  const targetLamports = sol * 1_000_000_000;
  let balance = await connection.getBalance(pubkey, "confirmed");
  while (balance < targetLamports) {
    const needed = Math.min(1_000_000_000, targetLamports - balance);
    const sig = await connection.requestAirdrop(pubkey, needed);
    await connection.confirmTransaction(sig, "confirmed");
    balance = await connection.getBalance(pubkey, "confirmed");
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

async function ensureLocalnet() {
  connection = new Connection(RPC_URL, "confirmed");
  try {
    await connection.getLatestBlockhash();
  } catch (error) {
    throw new Error("Localnet not reachable. Start with: solana-test-validator --reset --ledger /tmp/solana-test-ledger");
  }
  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (!programInfo) {
    throw new Error("Program not deployed on localnet. Deploy subscription_royalty before running E2E.");
  }
  const registryInfo = await connection.getAccountInfo(STREAM_REGISTRY_PROGRAM_ID);
  if (!registryInfo) {
    throw new Error("Stream registry not deployed on localnet. Deploy stream_registry before running E2E.");
  }
}

function sha256Bytes(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

function sha256Hex(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return createHash("sha256").update(buf).digest("hex");
}

function writeBigInt64LE(buffer: Uint8Array, value: bigint, offset: number) {
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    buffer[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function writeUint32LE(buffer: Uint8Array, value: number, offset: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

function encodeUpsertTierData(params: {
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  priceLamports: number;
  quota: number;
  status: number;
}): Buffer {
  const tierHash = sha256Bytes(params.tierId);
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 1);
  data.set(UPSERT_TIER_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.priceLamports), 42);
  writeUint32LE(data, params.quota, 50);
  data[54] = params.status;
  return Buffer.from(data);
}

function loadSubscriptionCoder(): anchor.BorshAccountsCoder {
  const idlPath = path.resolve(process.cwd(), "../backend/idl/subscription_royalty.json");
  const idlRaw = readFileSync(idlPath, "utf8");
  const idl = JSON.parse(idlRaw) as anchor.Idl;
  return new anchor.BorshAccountsCoder(idl);
}

function loadStreamRegistryCoder(): anchor.BorshInstructionCoder {
  const idlPath = path.resolve(process.cwd(), "../backend/idl/stream_registry.json");
  const idlRaw = readFileSync(idlPath, "utf8");
  const idl = JSON.parse(idlRaw) as anchor.Idl;
  return new anchor.BorshInstructionCoder(idl);
}

async function ensureStreamExists(args: {
  streamId: string;
  tiersSeed: string;
  authority: Keypair;
  coder: anchor.BorshInstructionCoder;
  dao?: PublicKey;
}): Promise<PublicKey> {
  const streamIdBytes = sha256Bytes(args.streamId);
  const tiersHashBytes = sha256Bytes(args.tiersSeed);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream"), streamIdBytes],
    STREAM_REGISTRY_PROGRAM_ID
  );

  const exists = await connection.getAccountInfo(pda);
  if (exists) {
    return pda;
  }

  const data = args.coder.encode("create_stream", {
    stream_id: Array.from(streamIdBytes),
    tiers_hash: Array.from(tiersHashBytes),
    dao: args.dao ?? args.authority.publicKey,
  });

  const ix = new anchor.web3.TransactionInstruction({
    programId: STREAM_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [args.authority]);
  return pda;
}

async function ensureTierExists(args: {
  stream: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  priceLamports: number;
  quota: number;
  authority: Keypair;
}) {
  return ensureTierWithStatus({ ...args, status: 1 });
}

async function ensureTierWithStatus(args: {
  stream: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  priceLamports: number;
  quota: number;
  status: number;
  authority: Keypair;
}) {
  const tierHash = sha256Bytes(args.tierId);
  const [tierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), args.stream.toBuffer(), tierHash],
    STREAM_REGISTRY_PROGRAM_ID
  );
  const exists = await connection.getAccountInfo(tierPda);
  if (exists) return tierPda;
  const data = encodeUpsertTierData({
    tierId: args.tierId,
    pricingType: args.pricingType,
    evidenceLevel: args.evidenceLevel,
    priceLamports: args.priceLamports,
    quota: args.quota,
    status: args.status,
  });
  const ix = new anchor.web3.TransactionInstruction({
    programId: STREAM_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: args.stream, isSigner: false, isWritable: true },
      { pubkey: tierPda, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [args.authority]);
  return tierPda;
}

async function setStreamStatus(args: {
  stream: PublicKey;
  tiersSeed: string;
  status: number;
  authority: Keypair;
  coder: anchor.BorshInstructionCoder;
}) {
  const tiersHashBytes = sha256Bytes(args.tiersSeed);
  const data = args.coder.encode("update_stream", {
    tiers_hash: Array.from(tiersHashBytes),
    status: args.status,
  });
  const ix = new anchor.web3.TransactionInstruction({
    programId: STREAM_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: args.stream, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [args.authority]);
}

async function sendSubscribeTx(args: {
  stream: PublicKey;
  subscriber: Keypair;
  maker: PublicKey;
  treasury: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  priceLamports: number;
  quotaRemaining: number;
}) {
  const { buildSubscribeInstruction, defaultExpiryMs } = await import("../../frontend/app/lib/solana.ts");
  const ix = await buildSubscribeInstruction({
    programId: PROGRAM_ID,
    stream: args.stream,
    subscriber: args.subscriber.publicKey,
    tierId: args.tierId,
    pricingType: args.pricingType,
    evidenceLevel: args.evidenceLevel,
    expiresAtMs: defaultExpiryMs(),
    quotaRemaining: args.quotaRemaining,
    priceLamports: args.priceLamports,
    maker: args.maker,
    treasury: args.treasury,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = args.subscriber.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  await sendAndConfirmTransaction(connection, tx, [args.subscriber]);
}

async function sendRegisterWalletKeyTx(args: {
  subscriber: Keypair;
  encPubKeyBase64: string;
}) {
  const { buildRegisterWalletKeyInstruction } = await import("../../frontend/app/lib/solana.ts");
  const ix = buildRegisterWalletKeyInstruction({
    programId: PROGRAM_ID,
    subscriber: args.subscriber.publicKey,
    encPubKeyBase64: args.encPubKeyBase64,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = args.subscriber.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  await sendAndConfirmTransaction(connection, tx, [args.subscriber]);
}

beforeAll(async () => {
  await ensureLocalnet();

  const authorityPath =
    process.env.E2E_AUTHORITY_KEYPAIR ??
    process.env.SOLANA_KEYPAIR ??
    path.resolve(process.cwd(), "../.keys/localnet.json");
  let keypair: Keypair;
  if (existsSync(authorityPath)) {
    keypair = loadKeypairFromFile(authorityPath);
    tempKeypairPath = authorityPath;
  } else {
    keypair = Keypair.generate();
    const dir = mkdtempSync(path.join(tmpdir(), "stream-e2e-"));
    tempKeypairPath = path.join(dir, "backend-keypair.json");
    writeFileSync(tempKeypairPath, JSON.stringify(Array.from(keypair.secretKey)));
  }
  // eslint-disable-next-line no-console
  console.log("E2E authority keypair:", tempKeypairPath, keypair.publicKey.toBase58());
  authorityKeypair = keypair;
  await airdrop(connection, keypair.publicKey, 5);

  const coder = loadStreamRegistryCoder();
  const streamMap: Record<string, string> = {};
  for (const stream of TEST_STREAMS) {
    const pda = await ensureStreamExists({
      streamId: stream.id,
      tiersSeed: `tiers:${stream.id}`,
      authority: keypair,
      coder,
    });
    streamMap[stream.id] = pda.toBase58();
    await ensureTierExists({
      stream: pda,
      tierId: stream.tierId,
      pricingType: stream.pricingType,
      evidenceLevel: stream.evidenceLevel,
      priceLamports: stream.priceLamports,
      quota: stream.quota,
      authority: keypair,
    });
  }

  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  process.env.SOLANA_RPC_URL = RPC_URL;
  process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID = PROGRAM_ID.toBase58();
  process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID = STREAM_REGISTRY_PROGRAM_ID.toBase58();
  process.env.NEXT_PUBLIC_STREAM_REGISTRY_PROGRAM_ID = STREAM_REGISTRY_PROGRAM_ID.toBase58();
  process.env.SOLANA_KEYPAIR = tempKeypairPath;
  process.env.SOLANA_IDL_PATH = path.resolve(process.cwd(), "../backend/idl/subscription_royalty.json");
  process.env.SOLANA_STREAM_MAP = JSON.stringify(streamMap);

  const { createApp } = await import("../../backend/src/app.ts");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind backend server");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("E2E maker/taker flow", () => {
  it("delivers signals to SDK and MCP listeners with strict validation", async () => {
    const streams = TEST_STREAMS.map((stream) => ({
      id: stream.id,
      tier: stream.tierId,
      pricingType: stream.pricingType,
      evidenceLevel: stream.evidenceLevel,
      priceLamports: stream.priceLamports,
      quota: stream.quota,
    }));

    const streamMap = JSON.parse(process.env.SOLANA_STREAM_MAP ?? "{}") as Record<string, string>;
    const streamPubkeys = Object.fromEntries(
      streams.map((p) => [p.id, new PublicKey(streamMap[p.id])])
    ) as Record<string, PublicKey>;

    const takers = Array.from({ length: 10 }).map(() => ({
      wallet: Keypair.generate(),
      keys: SigintsClient.generateKeys(),
    }));

    // Fund takers and register encryption keys
    for (const taker of takers) {
      await airdrop(connection, taker.wallet.publicKey, 3);
    }

    // On-chain subscription NFTs
    for (const [idx, taker] of takers.entries()) {
      const stream = streams[idx % streams.length];
      const streamPubkey = streamPubkeys[stream.id];
      await sendSubscribeTx({
        stream: streamPubkey,
        subscriber: taker.wallet,
        maker: authorityKeypair.publicKey,
        treasury: authorityKeypair.publicKey,
        tierId: stream.tier,
        pricingType: stream.pricingType,
        evidenceLevel: stream.evidenceLevel,
        priceLamports: stream.priceLamports,
        quotaRemaining: stream.quota,
      });

      const subscriptionPda = deriveSubscriptionPda(PROGRAM_ID, streamPubkey, taker.wallet.publicKey);
      const subscriptionMint = deriveSubscriptionMint(PROGRAM_ID, streamPubkey, taker.wallet.publicKey);
      const account = await connection.getAccountInfo(subscriptionPda, "confirmed");
      expect(account).not.toBeNull();
      const decoded = decodeSubscriptionAccount(subscriptionPda, account!.data);
      expect(decoded).not.toBeNull();
      expect(decoded!.subscriber).toBe(taker.wallet.publicKey.toBase58());
      expect(decoded!.stream).toBe(streamPubkey.toBase58());
      expect(decoded!.pricingType).toBe(stream.pricingType);
      expect(decoded!.evidenceLevel).toBe(stream.evidenceLevel);
      expect(decoded!.quotaRemaining).toBe(0);
      expect(decoded!.status).toBe(0);
      expect(decoded!.nftMint).toBe(subscriptionMint.toBase58());
      const expectedTierHash = sha256Hex(Buffer.from(stream.tier, "utf8"));
      expect(decoded!.tierIdHex).toBe(expectedTierHash);

      const mint = await getMint(connection, subscriptionMint, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(mint.decimals).toBe(0);
      expect(mint.supply).toBe(1n);
      expect(mint.mintAuthority).toBeNull();
      expect(mint.freezeAuthority).toBeNull();

      const ata = getAssociatedTokenAddressSync(
        subscriptionMint,
        taker.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const tokenAccount = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(tokenAccount.amount).toBe(1n);

      await sendRegisterWalletKeyTx({
        subscriber: taker.wallet,
        encPubKeyBase64: taker.keys.publicKeyDerBase64,
      });
    }

    for (const [idx, taker] of takers.entries()) {
      const streamId = streams[idx % streams.length].id;
      const res = await fetch(`${baseUrl}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          streamId,
          encPubKeyDerBase64: taker.keys.publicKeyDerBase64,
          subscriberWallet: taker.wallet.publicKey.toBase58(),
        }),
      });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { subscriberId: string };
      const expectedId = subscriberIdFromPubkey(taker.keys.publicKeyDerBase64);
      expect(body.subscriberId).toBe(expectedId);
    }

    const subscriptionCoder = loadSubscriptionCoder();
    for (const stream of streams) {
      const streamPubkey = streamPubkeys[stream.id];
      const streamState = deriveStreamState(PROGRAM_ID, streamPubkey);
      const account = await connection.getAccountInfo(streamState, "confirmed");
      expect(account).not.toBeNull();
      const decoded = subscriptionCoder.decode("StreamState", account!.data) as {
        stream: PublicKey;
        subscriptionCount?: anchor.BN;
        subscription_count?: anchor.BN;
        bump: number;
      };
      const subscriptionCount = decoded.subscriptionCount ?? decoded.subscription_count;
      const expectedCount = takers.filter((_, idx) => streams[idx % streams.length].id === stream.id).length;
      expect(decoded.stream.toBase58()).toBe(streamPubkey.toBase58());
      expect(subscriptionCount?.toNumber()).toBe(expectedCount);
      expect(decoded.bump).toBeGreaterThanOrEqual(0);
    }

    const actions: string[] = [];
    const receivedByTaker = new Map<string, { streamId: string; plaintext: string }>();
    const listenerErrors: string[] = [];
    const duplicateSignals: string[] = [];
    const signalStats: Array<{ createdAt: number; receivedAt: number }> = [];
    const listeners: Array<() => void> = [];

    for (const [idx, taker] of takers.entries()) {
      const stream = streams[idx % streams.length];
      const client = new SigintsClient({
        rpcUrl: RPC_URL,
        backendUrl: baseUrl,
        programId: PROGRAM_ID.toBase58(),
        keyboxAuth: {
          walletPubkey: taker.wallet.publicKey.toBase58(),
          signMessage: (message) => nacl.sign.detached(message, taker.wallet.secretKey),
        },
      });

      const stop = await client.listenForSignals({
        streamId: stream.id,
        streamPubkey: streamMap[stream.id],
        subscriberKeys: {
          publicKeyDerBase64: taker.keys.publicKeyDerBase64,
          privateKeyDerBase64: taker.keys.privateKeyDerBase64,
        },
        maxAgeMs: 60_000,
        includeBlockTime: true,
        onSignal: (signal) => {
          const takerId = taker.wallet.publicKey.toBase58();
          const expectedPlaintext = `${stream.id}-signal`;
          if (receivedByTaker.has(takerId)) {
            duplicateSignals.push(signal.signalHash);
            return;
          }
          if (signal.metadata.streamId !== stream.id) {
            listenerErrors.push(`stream mismatch for ${takerId}`);
          }
          if (signal.plaintext !== expectedPlaintext) {
            listenerErrors.push(`plaintext mismatch for ${takerId}`);
          }
          if (signal.ageMs < 0 || signal.ageMs > 60_000) {
            listenerErrors.push(`age out of range for ${takerId}`);
          }
          if (signal.receivedAt < signal.createdAt) {
            listenerErrors.push(`receivedAt before createdAt for ${takerId}`);
          }
          actions.push(`sdk:${takerId}:${signal.plaintext}`);
          receivedByTaker.set(takerId, { streamId: signal.metadata.streamId, plaintext: signal.plaintext });
          signalStats.push({ createdAt: signal.createdAt, receivedAt: signal.receivedAt });
        },
      });
      listeners.push(stop);
    }

    // MCP listener
    const { createServer } = await import("../../mcp-server/src/server.ts");
    const serverInstance = createServer((cfg) => new SigintsClient(cfg));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client(
      { name: "e2e-client", version: "0.1.0" },
      { capabilities: { logging: {} } }
    );
    await serverInstance.connect(serverTransport);
    await mcpClient.connect(clientTransport);

    let mcpReceived = false;
    let mcpPayload: any = null;
    mcpClient.setNotificationHandler(LoggingMessageNotificationSchema, (note) => {
      if (note.params?.data?.signalHash) {
        mcpReceived = true;
        mcpPayload = note.params?.data;
      }
    });

    await mcpClient.callTool({
      name: "listen_stream_signals",
      arguments: {
        streamId: streams[0].id,
        streamPubkey: streamMap[streams[0].id],
        subscriberPublicKeyBase64: takers[0].keys.publicKeyDerBase64,
        subscriberPrivateKeyBase64: takers[0].keys.privateKeyDerBase64,
        walletSecretKeyBase58: bs58.encode(takers[0].wallet.secretKey),
        backendUrl: baseUrl,
        rpcUrl: RPC_URL,
        programId: PROGRAM_ID.toBase58(),
        maxAgeMs: 60_000,
      },
    });

    // Makers publish signals
    const published: Array<{ streamId: string; metadata: any }> = [];
    for (const stream of streams) {
      const payload = Buffer.from(`${stream.id}-signal`, "utf8").toString("base64");
      const res = await fetch(`${baseUrl}/signals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streamId: stream.id, tierId: stream.tier, plaintextBase64: payload }),
      });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { metadata: any };
      expect(body.metadata).toBeTruthy();
      expect(typeof body.metadata.signalHash).toBe("string");
      expect(body.metadata.signalHash).toHaveLength(64);
      expect(body.metadata.signalPointer).toBe(`backend://ciphertext/${body.metadata.signalHash}`);
      expect(body.metadata.keyboxPointer).toBe(`backend://keybox/${body.metadata.keyboxHash}`);
      expect(body.metadata.onchainTx).toBeTruthy();
      published.push({ streamId: stream.id, metadata: body.metadata });
    }

    await waitFor(() => receivedByTaker.size >= takers.length, 15_000, 300);
    await waitFor(() => mcpReceived, 10_000, 250);

    for (const item of published) {
      const meta = item.metadata;
      const latestRes = await fetch(`${baseUrl}/signals/latest?streamId=${encodeURIComponent(item.streamId)}`);
      expect(latestRes.ok).toBe(true);
      const latestBody = (await latestRes.json()) as { signal: any };
      expect(latestBody.signal.signalHash).toBe(meta.signalHash);

      const cipherRes = await fetch(`${baseUrl}/storage/ciphertext/${meta.signalHash}`);
      expect(cipherRes.ok).toBe(true);
      const cipherBody = (await cipherRes.json()) as { payload: any };
      const cipherHash = sha256Hex(Buffer.from(JSON.stringify(cipherBody.payload)));
      expect(cipherHash).toBe(meta.signalHash);

      const matchingTakers = takers.filter((_, idx) => streams[idx % streams.length].id === item.streamId);
      for (const taker of matchingTakers) {
        const message = Buffer.from(`sigints:keybox:${meta.keyboxHash}`, "utf8");
        const signature = Buffer.from(nacl.sign.detached(message, taker.wallet.secretKey)).toString("base64");
        const entryRes = await fetch(
          `${baseUrl}/storage/keybox/${meta.keyboxHash}` +
            `?wallet=${encodeURIComponent(taker.wallet.publicKey.toBase58())}` +
            `&signature=${encodeURIComponent(signature)}` +
            `&encPubKeyDerBase64=${encodeURIComponent(taker.keys.publicKeyDerBase64)}`
        );
        expect(entryRes.ok).toBe(true);
      }

      const streamPubkey = streamPubkeys[item.streamId];
      const [signalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("signal_latest"), streamPubkey.toBuffer()],
        PROGRAM_ID
      );
      const signalAccount = await connection.getAccountInfo(signalPda, "confirmed");
      expect(signalAccount).not.toBeNull();
      const decoded = sdkTesting.decodeSignalRecord(signalAccount!.data);
      expect(decoded).not.toBeNull();
      expect(decoded!.stream).toBe(streamPubkey.toBase58());
      expect(decoded!.signalHash).toBe(meta.signalHash);
      expect(decoded!.keyboxHash).toBe(meta.keyboxHash);
      const signalPointerHash = sha256Hex(meta.signalPointer);
      const keyboxPointerHash = sha256Hex(meta.keyboxPointer);
      expect(decoded!.signalPointerHash).toBe(signalPointerHash);
      expect(decoded!.keyboxPointerHash).toBe(keyboxPointerHash);
      expect(Math.abs(decoded!.createdAt - meta.createdAt)).toBeLessThan(120_000);
    }

    const mcpResult = await mcpClient.callTool({
      name: "check_stream_signal",
      arguments: {
        streamId: streams[0].id,
        streamPubkey: streamMap[streams[0].id],
        subscriberPublicKeyBase64: takers[0].keys.publicKeyDerBase64,
        subscriberPrivateKeyBase64: takers[0].keys.privateKeyDerBase64,
        walletSecretKeyBase58: bs58.encode(takers[0].wallet.secretKey),
        backendUrl: baseUrl,
        rpcUrl: RPC_URL,
        programId: PROGRAM_ID.toBase58(),
        maxAgeMs: 60_000,
      },
    });
    const contentText = mcpResult.content?.[0]?.type === "text" ? mcpResult.content[0].text : "";
    const parsed = contentText.startsWith("{") ? JSON.parse(contentText) : null;
    expect(parsed?.streamId).toBe(streams[0].id);
    expect(parsed?.plaintext).toBe(`${streams[0].id}-signal`);

    listeners.forEach((stop) => stop());

    expect(actions.length).toBe(takers.length);
    expect(receivedByTaker.size).toBe(takers.length);
    expect(listenerErrors).toEqual([]);
    expect(duplicateSignals).toEqual([]);
    expect(signalStats.some((t) => t.receivedAt - t.createdAt < 60_000)).toBe(true);
    expect(mcpReceived).toBe(true);
    expect(mcpPayload?.streamId).toBe(streams[0].id);
    expect(mcpPayload?.plaintext).toBe(`${streams[0].id}-signal`);
  });
});

describe("Subscription enforcement", () => {
  async function expectSubscribeFailure(args: {
    stream: PublicKey;
    subscriber: Keypair;
    maker: PublicKey;
    treasury: PublicKey;
    tierId: string;
    pricingType: number;
    evidenceLevel: number;
    priceLamports: number;
    quotaRemaining: number;
  }) {
    const subscriptionPda = deriveSubscriptionPda(
      PROGRAM_ID,
      args.stream,
      args.subscriber.publicKey
    );
    await expect(sendSubscribeTx(args)).rejects.toThrow();
    const account = await connection.getAccountInfo(subscriptionPda, "confirmed");
    expect(account).toBeNull();
  }

  it("charges subscriber and splits fee/maker payouts", async () => {
    const coder = loadStreamRegistryCoder();
    const treasury = Keypair.generate();
    await airdrop(connection, treasury.publicKey, 1);
    const streamId = `stream-payment-${treasury.publicKey.toBase58().slice(0, 6)}`;
    const tiersSeed = `tiers:${streamId}`;
    const stream = await ensureStreamExists({
      streamId,
      tiersSeed,
      authority: authorityKeypair,
      coder,
      dao: treasury.publicKey,
    });
    const tierId = "pro";
    const pricingType = 1;
    const evidenceLevel = 0;
    const priceLamports = 1_000_000;
    const quota = 0;
    await ensureTierExists({
      stream,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quota,
      authority: authorityKeypair,
    });

    const subscriber = Keypair.generate();
    await airdrop(connection, subscriber.publicKey, 10);

    const makerBefore = await connection.getBalance(authorityKeypair.publicKey, "confirmed");
    const treasuryBefore = await connection.getBalance(treasury.publicKey, "confirmed");

    await sendSubscribeTx({
      stream,
      subscriber,
      maker: authorityKeypair.publicKey,
      treasury: treasury.publicKey,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quotaRemaining: quota,
    });

    const makerAfter = await connection.getBalance(authorityKeypair.publicKey, "confirmed");
    const treasuryAfter = await connection.getBalance(treasury.publicKey, "confirmed");

    const fee = Math.floor((priceLamports * 100) / 10_000);
    const makerAmount = priceLamports - fee;

    expect(makerAfter - makerBefore).toBe(makerAmount);
    expect(treasuryAfter - treasuryBefore).toBe(fee);
  });

  it("rejects price and tier mismatches", async () => {
    const coder = loadStreamRegistryCoder();
    const streamId = "stream-enforce";
    const tiersSeed = "tiers:stream-enforce";
    const stream = await ensureStreamExists({
      streamId,
      tiersSeed,
      authority: authorityKeypair,
      coder,
    });
    const tierId = "gold";
    const pricingType = 1;
    const evidenceLevel = 0;
    const priceLamports = 1_000_000;
    const quota = 0;
    await ensureTierExists({
      stream,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quota,
      authority: authorityKeypair,
    });

    const cases = [
      { label: "price mismatch", overrides: { priceLamports: priceLamports - 1 } },
      { label: "pricing type mismatch", overrides: { pricingType: 0 } },
      { label: "evidence mismatch", overrides: { evidenceLevel: 1 } },
      { label: "quota mismatch", overrides: { quotaRemaining: 5 } },
    ];

    for (const testCase of cases) {
      const subscriber = Keypair.generate();
      await airdrop(connection, subscriber.publicKey, 2);
      await expectSubscribeFailure({
        stream,
        subscriber,
        maker: authorityKeypair.publicKey,
        treasury: authorityKeypair.publicKey,
        tierId,
        pricingType,
        evidenceLevel,
        priceLamports,
        quotaRemaining: quota,
        ...testCase.overrides,
      });
    }
  });

  it("rejects wrong maker/treasury", async () => {
    const coder = loadStreamRegistryCoder();
    const streamId = "stream-enforce-auth";
    const tiersSeed = "tiers:stream-enforce-auth";
    const stream = await ensureStreamExists({
      streamId,
      tiersSeed,
      authority: authorityKeypair,
      coder,
    });
    const tierId = "basic";
    const pricingType = 1;
    const evidenceLevel = 0;
    const priceLamports = 2_000_000;
    const quota = 0;
    await ensureTierExists({
      stream,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quota,
      authority: authorityKeypair,
    });

    const subscriber = Keypair.generate();
    await airdrop(connection, subscriber.publicKey, 2);

    await expectSubscribeFailure({
      stream,
      subscriber,
      maker: Keypair.generate().publicKey,
      treasury: authorityKeypair.publicKey,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quotaRemaining: quota,
    });

    const subscriber2 = Keypair.generate();
    await airdrop(connection, subscriber2.publicKey, 2);
    await expectSubscribeFailure({
      stream,
      subscriber: subscriber2,
      maker: authorityKeypair.publicKey,
      treasury: Keypair.generate().publicKey,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quotaRemaining: quota,
    });
  });

  it("rejects inactive stream and inactive tier", async () => {
    const coder = loadStreamRegistryCoder();

    const inactiveStreamId = "stream-inactive";
    const inactiveStreamSeed = "tiers:stream-inactive";
    const inactiveStream = await ensureStreamExists({
      streamId: inactiveStreamId,
      tiersSeed: inactiveStreamSeed,
      authority: authorityKeypair,
      coder,
    });
    await ensureTierExists({
      stream: inactiveStream,
      tierId: "active",
      pricingType: 1,
      evidenceLevel: 0,
      priceLamports: 500_000,
      quota: 0,
      authority: authorityKeypair,
    });
    await setStreamStatus({
      stream: inactiveStream,
      tiersSeed: inactiveStreamSeed,
      status: 0,
      authority: authorityKeypair,
      coder,
    });

    const inactiveStreamSubscriber = Keypair.generate();
    await airdrop(connection, inactiveStreamSubscriber.publicKey, 2);
    await expectSubscribeFailure({
      stream: inactiveStream,
      subscriber: inactiveStreamSubscriber,
      maker: authorityKeypair.publicKey,
      treasury: authorityKeypair.publicKey,
      tierId: "active",
      pricingType: 1,
      evidenceLevel: 0,
      priceLamports: 500_000,
      quotaRemaining: 0,
    });

    const tierInactiveStreamId = "stream-tierinactive";
    const tierInactiveSeed = "tiers:stream-tierinactive";
    const tierInactiveStream = await ensureStreamExists({
      streamId: tierInactiveStreamId,
      tiersSeed: tierInactiveSeed,
      authority: authorityKeypair,
      coder,
    });
    await ensureTierWithStatus({
      stream: tierInactiveStream,
      tierId: "sleep",
      pricingType: 1,
      evidenceLevel: 0,
      priceLamports: 400_000,
      quota: 0,
      status: 0,
      authority: authorityKeypair,
    });

    const inactiveTierSubscriber = Keypair.generate();
    await airdrop(connection, inactiveTierSubscriber.publicKey, 2);
    await expectSubscribeFailure({
      stream: tierInactiveStream,
      subscriber: inactiveTierSubscriber,
      maker: authorityKeypair.publicKey,
      treasury: authorityKeypair.publicKey,
      tierId: "sleep",
      pricingType: 1,
      evidenceLevel: 0,
      priceLamports: 400_000,
      quotaRemaining: 0,
    });
  });
});
