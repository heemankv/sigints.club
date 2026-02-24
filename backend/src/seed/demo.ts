import "../env";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getDb } from "../db";
import { SqlSignalStore } from "../signals";
import { SqlUserStore, SqlAgentStore, SqlAgentSubscriptionStore } from "../social";
import { StreamTier } from "../streams";
import { buildTiersSeed } from "../streams/tiersHash";
import { generateX25519Keypair, subscriberIdFromPubkey } from "../crypto/hybrid";
import { SignalService } from "../services/SignalService";
import { getTapestryClient } from "../tapestry";
import { SocialService } from "../services/SocialService";
import { TapestryStreamService } from "../services/TapestryStreamService";
import { TapestryPublisher } from "../tapestry/TapestryPublisher";
import { initDb } from "../db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");
const bs58Codec = (bs58 as unknown as { default?: typeof bs58 }).default ?? bs58;
const SUBSCRIBE_DISCRIMINATOR = new Uint8Array([254, 28, 191, 138, 156, 179, 183, 53]);
const UPSERT_TIER_DISCRIMINATOR = new Uint8Array([238, 232, 181, 0, 157, 149, 0, 202]);
const PRICING_TYPE_MAP: Record<string, number> = {
  subscription_unlimited: 1,
};
const EVIDENCE_LEVEL_MAP: Record<string, number> = {
  trust: 0,
  verifier: 1,
};

const streamSpecs = [
  {
    id: "stream-eth",
    name: "ETH Scout",
    domain: "pricing",
    description: "Best ETH price alerts across top venues.",
    accuracy: "98%",
    latency: "<2s",
    price: "0 SOL/mo",
    evidence: "trust",
  },
  {
    id: "stream-amazon",
    name: "Amazon Dropwatch",
    domain: "commerce",
    description: "Live Amazon availability + deal alerts.",
    accuracy: "95%",
    latency: "<5s",
    price: "0.08 SOL/mo",
    evidence: "trust",
  },
  {
    id: "stream-anime",
    name: "Anime Pulse",
    domain: "media",
    description: "Anime episode drop alerts with timestamps.",
    accuracy: "93%",
    latency: "<10s",
    price: "0.02 SOL/mo",
    evidence: "verifier",
  },
];

const streamTiers: Record<string, { tierId: string; pricingType: "subscription_unlimited"; evidenceLevel: "trust" | "verifier"; priceLamports: number; quota: number }> = {
  "stream-eth": { tierId: "tier-eth-trust", pricingType: "subscription_unlimited", evidenceLevel: "trust", priceLamports: 0, quota: 0 },
  "stream-amazon": { tierId: "tier-amz-trust", pricingType: "subscription_unlimited", evidenceLevel: "trust", priceLamports: 80_000_000, quota: 0 },
  "stream-anime": { tierId: "tier-anime-verifier", pricingType: "subscription_unlimited", evidenceLevel: "verifier", priceLamports: 20_000_000, quota: 0 },
};

function formatTierPriceLabel(tier: { pricingType: string; priceLamports: number }) {
  const sol = tier.priceLamports / 1_000_000_000;
  return `${sol} SOL/mo`;
}

const signalTemplates: Record<string, string[]> = {
  "stream-eth": [
    "ETH best price: $2,512 on Kraken (spread 0.18%)",
    "ETH best price: $2,523 on Coinbase (depth 250k)",
    "ETH alert: volatility spike, maker confidence 0.92",
  ],
  "stream-amazon": [
    "Amazon drop: Echo Dot 5th Gen $29 (Prime)",
    "Amazon alert: SSD 1TB $49, deal ends in 2h",
  ],
  "stream-anime": [
    "One Piece ep 1103 drops today 19:30 UTC",
    "Jujutsu Kaisen S2 finale live in 45 min",
  ],
};

const streamVisibility: Record<string, "public" | "private"> = {
  "stream-eth": "public",
  "stream-amazon": "private",
  "stream-anime": "private",
};

type SeedOptions = {
  force?: boolean;
  seedOnchain?: boolean;
  seedSocial?: boolean;
  deployPrograms?: boolean;
};

type DemoSummary = {
  createdAt: number;
  streams: Array<{ id: string; pda?: string }>;
  makerWallets: string[];
  listenerWallets: string[];
  subscriberKeys: Array<{ streamId: string; subscriberId: string; publicKeyBase64: string; privateKeyBase64: string }>;
  signals: Array<{ streamId: string; signalHash: string; onchainTx?: string }>;
  onchainSubscriptions: Array<{ streamId: string; subscriber: string; signature?: string }>;
  notes?: string[];
};

function envTrue(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function parseJsonMap(value?: string): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Invalid JSON map, ignoring.", error);
    return undefined;
  }
}

function sha256Bytes(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadStreamRegistryCoder(): Promise<anchor.BorshInstructionCoder> {
  const idlPath = path.resolve(backendRoot, "idl", "stream_registry.json");
  const raw = await fs.readFile(idlPath, "utf8");
  const idl = JSON.parse(raw) as anchor.Idl;
  return new anchor.BorshInstructionCoder(idl);
}

async function loadSubscriptionCoder(): Promise<anchor.BorshInstructionCoder> {
  const idlPath = path.resolve(backendRoot, "idl", "subscription_royalty.json");
  const raw = await fs.readFile(idlPath, "utf8");
  const idl = JSON.parse(raw) as anchor.Idl;
  return new anchor.BorshInstructionCoder(idl);
}

async function loadAuthorityKeypair(): Promise<Keypair> {
  const keypairPath = process.env.SOLANA_KEYPAIR;
  if (keypairPath) {
    const raw = await fs.readFile(expandPath(keypairPath), "utf8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  if (process.env.SOLANA_PRIVATE_KEY) {
    return Keypair.fromSecretKey(bs58Codec.decode(process.env.SOLANA_PRIVATE_KEY));
  }
  throw new Error("SOLANA_KEYPAIR or SOLANA_PRIVATE_KEY must be set for seeding");
}

function expandPath(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", input.slice(2));
  }
  return input;
}

function isLocalnet(rpcUrl: string): boolean {
  return rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
}

async function resolveAnchorWalletPath(): Promise<string> {
  if (process.env.SOLANA_KEYPAIR) {
    return expandPath(process.env.SOLANA_KEYPAIR);
  }
  if (process.env.SOLANA_PRIVATE_KEY) {
    const keypair = Keypair.fromSecretKey(bs58Codec.decode(process.env.SOLANA_PRIVATE_KEY));
    const tempPath = path.join(
      os.tmpdir(),
      `sigints-anchor-${Date.now()}-${Math.floor(Math.random() * 1000)}.json`
    );
    await fs.writeFile(tempPath, JSON.stringify(Array.from(keypair.secretKey)));
    return tempPath;
  }
  throw new Error("SOLANA_KEYPAIR or SOLANA_PRIVATE_KEY must be set for anchor deploy");
}

async function syncIdlArtifacts(repoRoot: string) {
  const sourceDir = path.resolve(repoRoot, "target", "idl");
  const destDir = path.resolve(backendRoot, "idl");
  try {
    await fs.mkdir(destDir, { recursive: true });
    const entries = await fs.readdir(sourceDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      await fs.copyFile(path.join(sourceDir, entry), path.join(destDir, entry));
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to sync IDL artifacts from target/idl", error);
  }
}

async function deployAnchorPrograms() {
  const repoRoot = path.resolve(backendRoot, "..");
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
  const walletPath = await resolveAnchorWalletPath();
  const result = spawnSync("anchor", ["deploy"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ANCHOR_PROVIDER_URL: rpcUrl,
      ANCHOR_WALLET: walletPath,
    },
  });
  if (result.status !== 0) {
    throw new Error("anchor deploy failed");
  }
  await syncIdlArtifacts(repoRoot);
}

async function ensureBalance(connection: Connection, pubkey: PublicKey, minSol = 1) {
  const balance = await connection.getBalance(pubkey, "confirmed");
  if (balance >= minSol * 1_000_000_000) return;
  const sig = await connection.requestAirdrop(pubkey, minSol * 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

async function ensureStreamConfig(args: {
  connection: Connection;
  programId: PublicKey;
  authority: Keypair;
  streamId: string;
  tiers: StreamTier[];
  visibility: "public" | "private";
  coder: anchor.BorshInstructionCoder;
}): Promise<PublicKey> {
  const streamIdBytes = sha256Bytes(args.streamId);
  const tiersSeed = buildTiersSeed(args.tiers);
  const tiersHashBytes = sha256Bytes(tiersSeed);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream"), streamIdBytes],
    args.programId
  );
  const existing = await args.connection.getAccountInfo(pda);
  if (existing) return pda;

  const data = args.coder.encode("create_stream", {
    stream_id: Array.from(streamIdBytes),
    tiers_hash: Array.from(tiersHashBytes),
    dao: args.authority.publicKey,
    visibility: args.visibility === "public" ? 0 : 1,
  });

  const ix = new anchor.web3.TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(args.connection, tx, [args.authority]);
  return pda;
}

async function ensureTierConfig(args: {
  connection: Connection;
  programId: PublicKey;
  authority: Keypair;
  stream: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  priceLamports: number;
  quota: number;
}): Promise<PublicKey> {
  const tierHash = sha256Bytes(args.tierId);
  const [tierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), args.stream.toBuffer(), tierHash],
    args.programId
  );
  const existing = await args.connection.getAccountInfo(tierPda);
  if (existing) return tierPda;

  const data = encodeUpsertTierData({
    tierId: args.tierId,
    pricingType: args.pricingType,
    evidenceLevel: args.evidenceLevel,
    priceLamports: args.priceLamports,
    quota: args.quota,
    status: 1,
  });

  const ix = new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.stream, isSigner: false, isWritable: true },
      { pubkey: tierPda, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });

  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(args.connection, tx, [args.authority]);
  return tierPda;
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
}): Uint8Array {
  const tierHash = sha256Bytes(params.tierId);
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 1);
  data.set(UPSERT_TIER_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.priceLamports), 42);
  writeUint32LE(data, params.quota, 50);
  data[54] = params.status;
  return data;
}

function defaultExpiryMs(): number {
  const days = 30;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function encodeSubscribeData(params: {
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
}): Uint8Array {
  const tierHash = sha256Bytes(params.tierId);
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 8);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.expiresAtMs), 42);
  writeUint32LE(data, params.quotaRemaining, 50);
  writeBigInt64LE(data, BigInt(params.priceLamports), 54);
  return data;
}

function deriveSubscriptionPda(programId: PublicKey, stream: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), stream.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

function deriveSubscriptionMint(programId: PublicKey, stream: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription_mint"), stream.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

function deriveStreamState(programId: PublicKey, stream: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_state"), stream.toBuffer()],
    programId
  );
  return pda;
}

async function sendSubscribeTx(args: {
  connection: Connection;
  programId: PublicKey;
  streamRegistryProgramId: PublicKey;
  stream: PublicKey;
  subscriber: Keypair;
  maker: PublicKey;
  treasury: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs?: number;
  quotaRemaining?: number;
  priceLamports?: number;
}): Promise<string> {
  const data = encodeSubscribeData({
    tierId: args.tierId,
    pricingType: args.pricingType,
    evidenceLevel: args.evidenceLevel,
    expiresAtMs: args.expiresAtMs ?? defaultExpiryMs(),
    quotaRemaining: args.quotaRemaining ?? 0,
    priceLamports: args.priceLamports ?? 0,
  });
  const subscription = deriveSubscriptionPda(args.programId, args.stream, args.subscriber.publicKey);
  const subscriptionMint = deriveSubscriptionMint(args.programId, args.stream, args.subscriber.publicKey);
  const streamState = deriveStreamState(args.programId, args.stream);
  const subscriberAta = getAssociatedTokenAddressSync(
    subscriptionMint,
    args.subscriber.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const tierHash = sha256Bytes(args.tierId);
  const [tierConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), args.stream.toBuffer(), tierHash],
    args.streamRegistryProgramId
  );

  const ix = new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: subscription, isSigner: false, isWritable: true },
      { pubkey: subscriptionMint, isSigner: false, isWritable: true },
      { pubkey: streamState, isSigner: false, isWritable: true },
      { pubkey: subscriberAta, isSigner: false, isWritable: true },
      { pubkey: args.stream, isSigner: false, isWritable: false },
      { pubkey: tierConfig, isSigner: false, isWritable: false },
      { pubkey: args.streamRegistryProgramId, isSigner: false, isWritable: false },
      { pubkey: args.subscriber.publicKey, isSigner: true, isWritable: true },
      { pubkey: args.maker, isSigner: false, isWritable: true },
      { pubkey: args.treasury, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
  if (envTrue("SEED_DEBUG", false)) {
    // eslint-disable-next-line no-console
    console.log("Subscribe ix keys:", ix.keys.map((k, idx) => `${idx}:${k.pubkey.toBase58()}:${k.isSigner ? "signer" : "nosign"}`));
  }

  const tx = new Transaction().add(ix);
  tx.feePayer = args.subscriber.publicKey;
  const { blockhash, lastValidBlockHeight } = await args.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  if (envTrue("SEED_DEBUG", false)) {
    const message = tx.compileMessage();
    const signerKeys = message.accountKeys
      .slice(0, message.header.numRequiredSignatures)
      .map((key) => key.toBase58());
    // eslint-disable-next-line no-console
    console.log("Subscribe signers:", signerKeys, "subscriber:", args.subscriber.publicKey.toBase58());
  }
  tx.sign(args.subscriber);
  const signerEntry = tx.signatures.find((sig) => sig.publicKey.equals(args.subscriber.publicKey));
  if (!signerEntry?.signature) {
    throw new Error("Subscriber signature missing after tx.sign()");
  }
  const signature = await args.connection.sendRawTransaction(tx.serialize());
  await args.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

function toBytes32(hex: string, label: string): Buffer {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`${label} must be 32 bytes (got ${buf.length})`);
  }
  return buf;
}

async function recordSignalOnchain(args: {
  connection: Connection;
  programId: PublicKey;
  streamRegistryProgramId: PublicKey;
  stream: PublicKey;
  authority: Keypair;
  coder: anchor.BorshInstructionCoder;
  signalHash: string;
  signalPointer: string;
  keyboxHash?: string | null;
  keyboxPointer?: string | null;
}): Promise<string> {
  const signalHashBytes = toBytes32(args.signalHash, "signalHash");
  const signalPointerHash = sha256Hex(Buffer.from(args.signalPointer));
  const signalPointerHashBytes = toBytes32(signalPointerHash, "signalPointerHash");
  const zero32 = new Uint8Array(32);
  const keyboxHashBytes = args.keyboxHash ? toBytes32(args.keyboxHash, "keyboxHash") : zero32;
  const keyboxPointerHashBytes = args.keyboxPointer
    ? toBytes32(sha256Hex(Buffer.from(args.keyboxPointer)), "keyboxPointerHash")
    : zero32;

  const [signalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("signal_latest"), args.stream.toBuffer()],
    args.programId
  );
  const [streamState] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_state"), args.stream.toBuffer()],
    args.programId
  );

  const data = args.coder.encode("record_signal", {
    signal_hash: Array.from(signalHashBytes),
    signal_pointer_hash: Array.from(signalPointerHashBytes),
    keybox_hash: Array.from(keyboxHashBytes),
    keybox_pointer_hash: Array.from(keyboxPointerHashBytes),
  });

  const ix = new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: signalPda, isSigner: false, isWritable: true },
      { pubkey: args.stream, isSigner: false, isWritable: false },
      { pubkey: args.streamRegistryProgramId, isSigner: false, isWritable: false },
      { pubkey: streamState, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = args.authority.publicKey;
  const { blockhash, lastValidBlockHeight } = await args.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(args.authority);
  const signerEntry = tx.signatures.find((sig) => sig.publicKey.equals(args.authority.publicKey));
  if (!signerEntry?.signature) {
    throw new Error("Authority signature missing after tx.sign()");
  }
  const signature = await args.connection.sendRawTransaction(tx.serialize());
  await args.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

export async function seedDemoData(options: SeedOptions = {}) {
  await initDb();
  const markerPath = path.resolve(backendRoot, "data", "demo_seed.json");
  if (!options.force && (await fileExists(markerPath))) {
    // eslint-disable-next-line no-console
    console.log("Demo seed already exists. Set SEED_DEMO_FORCE=true to regenerate.");
    return;
  }
  if (options.force) {
    await fs.rm(markerPath, { force: true });
  }

  const db = getDb();
  const signalStore = new SqlSignalStore(db);
  const userStore = new SqlUserStore(db);
  const agentStore = new SqlAgentStore(db);
  const agentSubscriptionStore = new SqlAgentSubscriptionStore(db);

  const seedOnchain = options.seedOnchain ?? true;
  const seedSocial = options.seedSocial ?? false;
  const deployPrograms = options.deployPrograms ?? false;

  if (deployPrograms) {
    await deployAnchorPrograms();
  }

  const makerWallets = Array.from({ length: 3 }).map(() => Keypair.generate());
  const listenerWallets = Array.from({ length: 10 }).map(() => Keypair.generate());

  const streamProfiles = streamSpecs.map((spec, idx) => {
    const tierConfig = streamTiers[spec.id];
    const tiers: StreamTier[] = [
      {
        tierId: tierConfig.tierId,
        pricingType: tierConfig.pricingType,
        price: formatTierPriceLabel(tierConfig),
        quota: tierConfig.quota ? String(tierConfig.quota) : undefined,
        evidenceLevel: tierConfig.evidenceLevel,
      },
    ];
    return {
      ...spec,
      ownerWallet: makerWallets[idx % makerWallets.length].publicKey.toBase58(),
      tiers,
    };
  });

  for (const [idx, maker] of makerWallets.entries()) {
    await userStore.upsertUser(maker.publicKey.toBase58(), {
      displayName: `Maker ${idx + 1}`,
      bio: "Seeded maker stream for demo flows.",
    });
  }

  for (const [idx, listener] of listenerWallets.entries()) {
    await userStore.upsertUser(listener.publicKey.toBase58(), {
      displayName: `Listener ${idx + 1}`,
      bio: "Seeded listener agent for demo flows.",
    });
  }

  const makerAgents = await Promise.all(
    streamProfiles.map((stream, idx) =>
      agentStore.createAgent({
        ownerWallet: makerWallets[idx % makerWallets.length].publicKey.toBase58(),
        name: `${stream.id.replace("stream-", "")} Scout`,
        role: "maker",
        streamId: stream.id,
        domain: stream.domain,
        description: `Seeded maker agent for ${stream.id}.`,
        evidence: stream.evidence as "trust" | "verifier",
        tiers: [
          {
            tierId: stream.tiers[0].tierId,
            pricingType: stream.tiers[0].pricingType,
            price: stream.tiers[0].price,
            evidenceLevel: stream.tiers[0].evidenceLevel,
          },
        ],
      })
    )
  );

  const listenerAgents = await Promise.all(
    listenerWallets.map((wallet, idx) =>
      agentStore.createAgent({
        ownerWallet: wallet.publicKey.toBase58(),
        name: `Listener-${idx + 1}`,
        role: "listener",
        domain: "automation",
        description: "Seeded listener agent for demo flows.",
        evidence: "trust",
      })
    )
  );

  for (const [idx, agent] of listenerAgents.entries()) {
    const stream = streamProfiles[idx % streamProfiles.length];
    const tier = streamTiers[stream.id];
    await agentSubscriptionStore.createAgentSubscription({
      ownerWallet: agent.ownerWallet,
      agentId: agent.id,
      streamId: stream.id,
      tierId: tier.tierId,
      pricingType: tier.pricingType,
      evidenceLevel: tier.evidenceLevel,
    });
  }

  const subscriberKeys: DemoSummary["subscriberKeys"] = [];
  for (const [idx, listener] of listenerWallets.entries()) {
    const stream = streamProfiles[idx % streamProfiles.length];
    const keys = generateX25519Keypair();
    const encPub = keys.publicKey.toString("base64");
    const subscriberId = subscriberIdFromPubkey(keys.publicKey);
    subscriberKeys.push({
      streamId: stream.id,
      subscriberId,
      publicKeyBase64: encPub,
      privateKeyBase64: keys.privateKey.toString("base64"),
    });
  }

  let streamMap: Record<string, string> | undefined;
  const onchainSubscriptions: DemoSummary["onchainSubscriptions"] = [];
  let chainConnection: Connection | undefined;
  let chainProgramId: PublicKey | undefined;
  let chainAuthority: Keypair | undefined;
  let chainCoder: anchor.BorshInstructionCoder | undefined;
  let chainRegistryProgramId: PublicKey | undefined;

  if (seedOnchain) {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
    const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
    const streamRegistryProgramId = process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID;

    if (!subscriptionProgramId || !streamRegistryProgramId) {
      // eslint-disable-next-line no-console
      console.warn("Missing SOLANA_SUBSCRIPTION_PROGRAM_ID or SOLANA_STREAM_REGISTRY_PROGRAM_ID. Skipping on-chain seeding.");
    } else {
      const connection = new Connection(rpcUrl, "confirmed");
      const programId = new PublicKey(subscriptionProgramId);
      const registryProgramId = new PublicKey(streamRegistryProgramId);
      const programAccount = await connection.getAccountInfo(programId);
      const registryAccount = await connection.getAccountInfo(registryProgramId);
      if (!programAccount || !registryAccount) {
        // eslint-disable-next-line no-console
        console.warn("On-chain programs not deployed on target RPC. Skipping on-chain seeding.");
      } else {
        let onchainReady = false;
        const authority = await loadAuthorityKeypair();
        try {
          if (isLocalnet(rpcUrl)) {
            await ensureBalance(connection, authority.publicKey, 3);
          }
          const coder = await loadStreamRegistryCoder();
          streamMap = {};
          for (const stream of streamProfiles) {
            const pda = await ensureStreamConfig({
              connection,
              programId: registryProgramId,
              authority,
              streamId: stream.id,
              tiers: stream.tiers,
              coder,
            });
            streamMap[stream.id] = pda.toBase58();
            const tier = streamTiers[stream.id];
            await ensureTierConfig({
              connection,
              programId: registryProgramId,
              authority,
              stream: pda,
              tierId: tier.tierId,
              pricingType: PRICING_TYPE_MAP[tier.pricingType],
              evidenceLevel: EVIDENCE_LEVEL_MAP[tier.evidenceLevel],
              priceLamports: tier.priceLamports,
              quota: tier.quota,
            });
          }
          onchainReady = true;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("On-chain stream/tier seed failed; skipping on-chain demo.", error);
        }

        if (onchainReady && streamMap) {
          chainConnection = connection;
          chainProgramId = programId;
          chainAuthority = authority;
          chainCoder = await loadSubscriptionCoder();
          chainRegistryProgramId = registryProgramId;

          for (const [idx, listener] of listenerWallets.entries()) {
            if (isLocalnet(rpcUrl)) {
              await ensureBalance(connection, listener.publicKey, 2);
            }
            const stream = streamProfiles[idx % streamProfiles.length];
            const tier = streamTiers[stream.id];
            try {
              const streamPda = streamMap?.[stream.id];
              if (!streamPda) {
                throw new Error(`Missing stream PDA for ${stream.id}`);
              }
              const signature = await sendSubscribeTx({
                connection,
                programId,
                streamRegistryProgramId: registryProgramId,
                stream: new PublicKey(streamPda),
                subscriber: listener,
                maker: authority.publicKey,
                treasury: authority.publicKey,
                tierId: tier.tierId,
                pricingType: PRICING_TYPE_MAP[tier.pricingType],
                evidenceLevel: EVIDENCE_LEVEL_MAP[tier.evidenceLevel],
                priceLamports: tier.priceLamports,
                quotaRemaining: tier.quota,
              });
              onchainSubscriptions.push({
                streamId: stream.id,
                subscriber: listener.publicKey.toBase58(),
                signature,
              });
            } catch (error) {
              // eslint-disable-next-line no-console
              console.warn("On-chain subscribe failed", error);
              onchainSubscriptions.push({
                streamId: stream.id,
                subscriber: listener.publicKey.toBase58(),
              });
            }
          }
        }
      }
    }
  }

  const tapestryEnabled = Boolean(process.env.TAPESTRY_API_KEY);
  const tapestryProfileMap = parseJsonMap(process.env.TAPESTRY_PROFILE_MAP);
  const tapestryClient = tapestryEnabled ? getTapestryClient() : undefined;
  const tapestryStreams = tapestryEnabled
    ? new TapestryStreamService(tapestryClient!, process.env.TAPESTRY_REGISTRY_PROFILE_ID)
    : undefined;
  const tapestryPublisher = tapestryEnabled
    ? new TapestryPublisher(tapestryClient!, process.env.TAPESTRY_PROFILE_ID, tapestryProfileMap, tapestryStreams)
    : undefined;

  const signalService = new SignalService(signalStore, tapestryPublisher);
  const signals: DemoSummary["signals"] = [];
  for (const stream of streamProfiles) {
    const tier = streamTiers[stream.id];
    const messages = signalTemplates[stream.id] ?? [];
    const streamSubscribers = subscriberKeys
      .filter((key) => key.streamId === stream.id)
      .map((key) => ({ encPubKeyDerBase64: key.publicKeyBase64 }));
    for (const message of messages) {
      const publish = await signalService.publishSignal(
        stream.id,
        tier.tierId,
        Buffer.from(message, "utf8"),
        streamSubscribers,
        streamVisibility[stream.id] ?? "private"
      );
      let onchainTx: string | undefined;
      if (
        seedOnchain &&
        chainConnection &&
        chainProgramId &&
        chainAuthority &&
        chainCoder &&
        chainRegistryProgramId &&
        streamMap?.[stream.id]
      ) {
        try {
          onchainTx = await recordSignalOnchain({
            connection: chainConnection,
            programId: chainProgramId,
            streamRegistryProgramId: chainRegistryProgramId,
            stream: new PublicKey(streamMap[stream.id]),
            authority: chainAuthority,
            coder: chainCoder,
            signalHash: publish.metadata.signalHash,
            signalPointer: publish.metadata.signalPointer,
            keyboxHash: publish.metadata.keyboxHash,
            keyboxPointer: publish.metadata.keyboxPointer,
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("on-chain record_signal failed", error);
        }
      }
      signals.push({
        streamId: stream.id,
        signalHash: publish.metadata.signalHash,
        onchainTx: onchainTx ?? publish.metadata.onchainTx,
      });
    }
  }

  if (tapestryEnabled && tapestryStreams && tapestryClient) {
    for (const stream of streamProfiles) {
      const onchainAddress = streamMap?.[stream.id];
      const authority = chainAuthority?.publicKey.toBase58();
      const dao = chainAuthority?.publicKey.toBase58();
      try {
        await tapestryStreams.upsertStream(
          {
            streamId: stream.id,
            name: stream.name,
            domain: stream.domain,
            description: stream.description,
            visibility: streamVisibility[stream.id] ?? "private",
            accuracy: stream.accuracy,
            latency: stream.latency,
            price: stream.price,
            evidence: stream.evidence,
            ownerWallet: stream.ownerWallet,
            authority,
            dao,
            onchainAddress,
          },
          stream.tiers
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Tapestry stream seed failed for ${stream.id}`, error);
      }
    }
    if (seedSocial) {
      try {
        const social = new SocialService(tapestryClient, userStore);
        for (const stream of streamProfiles) {
          const makerWallet = makerWallets[0]?.publicKey.toBase58();
          await social.createIntent({
            wallet: makerWallet,
            content: `Looking for ${stream.id} live alerts`,
            streamId: stream.id,
            tags: ["seed", "intent"],
            displayName: "Seed Maker",
          });
        }
        await social.createSlashReport({
          wallet: makerWallets[0]?.publicKey.toBase58(),
          content: "Seeded slash report for demo review.",
          streamId: "stream-eth",
          severity: "low",
          displayName: "Seed Validator",
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Social seeding failed", error);
      }
    }
  } else if (seedSocial) {
    // eslint-disable-next-line no-console
    console.warn("TAPESTRY_API_KEY missing; skipping social seeding.");
  }

  const summary: DemoSummary = {
    createdAt: Date.now(),
    streams: streamProfiles.map((p) => ({ id: p.id, pda: streamMap?.[p.id] })),
    makerWallets: makerWallets.map((w) => w.publicKey.toBase58()),
    listenerWallets: listenerWallets.map((w) => w.publicKey.toBase58()),
    subscriberKeys,
    signals,
    onchainSubscriptions,
    notes: [
      "Demo data seeded. Use subscriberKeys to decrypt signals via SDK or MCP.",
      "On-chain subscriptions are minted for listener wallets; import them to view in Profile page.",
    ],
  };

  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log("Demo seed complete. Summary written to", markerPath);
}

export async function maybeSeedDemoData() {
  if (!envTrue("SEED_DEMO_DATA", false)) return;
  if (process.env.NODE_ENV === "test") return;
  await seedDemoData({
    force: envTrue("SEED_DEMO_FORCE", false),
    seedOnchain: envTrue(
      "SEED_DEMO_ONCHAIN",
      Boolean(process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID && (process.env.SOLANA_KEYPAIR || process.env.SOLANA_PRIVATE_KEY))
    ),
    seedSocial: envTrue("SEED_DEMO_SOCIAL", Boolean(process.env.TAPESTRY_API_KEY)),
    deployPrograms: envTrue("SEED_DEPLOY_PROGRAMS", false),
  });
}

if (process.argv[1] === __filename) {
  seedDemoData({
    force: process.argv.includes("--force"),
    seedOnchain: envTrue("SEED_DEMO_ONCHAIN", true),
    seedSocial: envTrue("SEED_DEMO_SOCIAL", Boolean(process.env.TAPESTRY_API_KEY)),
    deployPrograms: process.argv.includes("--deploy") || envTrue("SEED_DEPLOY_PROGRAMS", false),
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
