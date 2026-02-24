import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import path from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { webcrypto } from "node:crypto";
import {
  SigintsClient,
  createBackendClient,
  createStream,
  prepareSignal,
  buildRecordSignalDelegatedInstruction,
  buildCreateStreamInstruction,
  buildUpsertTierInstruction,
  buildGrantPublisherInstruction,
  buildRegisterSubscriptionKeyInstruction,
  buildSubscribeInstruction,
  defaultExpiryMs,
  resolveEvidenceLevel,
  resolvePricingType,
} from "../../sdk/src/index.ts";
import type { TierInput } from "../../sdk/src/solana/tiers";

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
const RUN_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
const X25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);
const SIGNAL_COUNT = 5;
const SIGNAL_INTERVAL_MS = 10_000;

const STREAM_PRIVATE = {
  id: `stream-private-${RUN_ID}`,
  name: "BTC Market Analysis",
  domain: "crypto",
  description: "private analysis",
  visibility: "private" as const,
  accuracy: "95%",
  latency: "10s",
  price: "0.05 SOL/mo",
  evidence: "trust",
  tier: {
    tierId: "tier-basic",
    pricingType: "subscription_unlimited" as const,
    price: "0.05 SOL/mo",
    quota: "0",
    evidenceLevel: "trust" as const,
  },
  priceLamports: 50_000_000,
  quota: 0,
};

const STREAM_PUBLIC = {
  id: `stream-public-${RUN_ID}`,
  name: "BTC Price Ticker",
  domain: "crypto",
  description: "public ticker",
  visibility: "public" as const,
  accuracy: "99%",
  latency: "1s",
  price: "0 SOL/mo",
  evidence: "trust",
  tier: {
    tierId: "tier-basic",
    pricingType: "subscription_unlimited" as const,
    price: "0 SOL/mo",
    quota: "0",
    evidenceLevel: "trust" as const,
  },
  priceLamports: 0,
  quota: 0,
};

let connection: Connection;
let server: Server;
let baseUrl: string;
let tempKeypairPath: string;
let authorityKeypair: Keypair;
let startedServer = false;

function loadKeypairFromFile(filePath: string): Keypair {
  const raw = readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function x25519DerToRawBase64(base64Der: string): string {
  const bytes = Buffer.from(base64Der, "base64");
  if (bytes.length === 32) return bytes.toString("base64");
  if (bytes.length === 44 && bytes.subarray(0, X25519_SPKI_PREFIX.length).equals(X25519_SPKI_PREFIX)) {
    return bytes.subarray(X25519_SPKI_PREFIX.length).toString("base64");
  }
  throw new Error("Encryption public key must be 32 bytes (base64)");
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 120_000, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
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

async function ensureStreamOnchain(args: {
  streamId: string;
  tiers: TierInput[];
  authority: Keypair;
  visibility: "public" | "private";
}): Promise<PublicKey> {
  const streamPda = await buildStreamPda(args.streamId);
  const existing = await connection.getAccountInfo(streamPda);
  if (!existing) {
    const { instruction } = await buildCreateStreamInstruction({
      programId: STREAM_REGISTRY_PROGRAM_ID,
      authority: args.authority.publicKey,
      streamId: args.streamId,
      tiers: args.tiers,
      dao: args.authority.publicKey.toBase58(),
      visibility: args.visibility,
    });
    const tx = new Transaction().add(instruction);
    tx.feePayer = args.authority.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    await sendAndConfirmTransaction(connection, tx, [args.authority]);
  }
  return streamPda;
}

async function ensureTierOnchain(args: {
  stream: PublicKey;
  tier: TierInput;
  priceLamports: number;
  quota: number;
  authority: Keypair;
}): Promise<void> {
  const ix = await buildUpsertTierInstruction({
    programId: STREAM_REGISTRY_PROGRAM_ID,
    authority: args.authority.publicKey,
    stream: args.stream,
    tier: args.tier,
    priceLamports: args.priceLamports,
    quota: args.quota,
    status: 1,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = args.authority.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  await sendAndConfirmTransaction(connection, tx, [args.authority]);
}

async function buildStreamPda(streamId: string): Promise<PublicKey> {
  return (await buildCreateStreamInstruction({
    programId: STREAM_REGISTRY_PROGRAM_ID,
    authority: Keypair.generate().publicKey,
    streamId,
    tiers: [STREAM_PRIVATE.tier],
    visibility: "private",
  })).streamPda;
}

async function registerSubscriptionKeyOnchain(args: {
  subscriber: Keypair;
  stream: PublicKey;
  encPubKeyDerBase64: string;
}): Promise<void> {
  const rawKeyBase64 = x25519DerToRawBase64(args.encPubKeyDerBase64);
  const ix = buildRegisterSubscriptionKeyInstruction({
    programId: PROGRAM_ID,
    stream: args.stream,
    subscriber: args.subscriber.publicKey,
    encPubKeyBase64: rawKeyBase64,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = args.subscriber.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  await sendAndConfirmTransaction(connection, tx, [args.subscriber]);
}

async function subscribeOnchain(args: {
  subscriber: Keypair;
  stream: PublicKey;
  tierId: string;
  pricingType: "subscription_unlimited";
  evidenceLevel: "trust" | "verifier";
  priceLamports: number;
  maker: PublicKey;
  treasury: PublicKey;
}): Promise<void> {
  const ix = await buildSubscribeInstruction({
    programId: PROGRAM_ID,
    streamRegistryProgramId: STREAM_REGISTRY_PROGRAM_ID,
    stream: args.stream,
    subscriber: args.subscriber.publicKey,
    tierId: args.tierId,
    pricingType: resolvePricingType(args.pricingType),
    evidenceLevel: resolveEvidenceLevel(args.evidenceLevel),
    expiresAtMs: defaultExpiryMs(),
    quotaRemaining: 0,
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

function signMessage(keypair: Keypair, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, keypair.secretKey);
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
    const dir = mkdtempSync(path.join(tmpdir(), "agents-e2e-"));
    tempKeypairPath = path.join(dir, "backend-keypair.json");
    writeFileSync(tempKeypairPath, JSON.stringify(Array.from(keypair.secretKey)));
  }
  authorityKeypair = keypair;
  await airdrop(connection, keypair.publicKey, 5);

  const users = [
    "user01.json",
    "user02.json",
    "user03.json",
    "user04.json",
    "user05.json",
  ].map((file) => loadKeypairFromFile(path.resolve(process.cwd(), "../accounts", file)));
  for (const user of users) {
    await airdrop(connection, user.publicKey, 4);
  }

  const privateStreamPda = await ensureStreamOnchain({
    streamId: STREAM_PRIVATE.id,
    tiers: [STREAM_PRIVATE.tier],
    authority: users[0],
    visibility: "private",
  });
  await ensureTierOnchain({
    stream: privateStreamPda,
    tier: STREAM_PRIVATE.tier,
    priceLamports: STREAM_PRIVATE.priceLamports,
    quota: STREAM_PRIVATE.quota,
    authority: users[0],
  });

  const publicStreamPda = await ensureStreamOnchain({
    streamId: STREAM_PUBLIC.id,
    tiers: [STREAM_PUBLIC.tier],
    authority: users[1],
    visibility: "public",
  });
  await ensureTierOnchain({
    stream: publicStreamPda,
    tier: STREAM_PUBLIC.tier,
    priceLamports: STREAM_PUBLIC.priceLamports,
    quota: STREAM_PUBLIC.quota,
    authority: users[1],
  });

  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  process.env.SOLANA_RPC_URL = RPC_URL;
  process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID = PROGRAM_ID.toBase58();
  process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID = STREAM_REGISTRY_PROGRAM_ID.toBase58();
  process.env.NEXT_PUBLIC_STREAM_REGISTRY_PROGRAM_ID = STREAM_REGISTRY_PROGRAM_ID.toBase58();
  process.env.SOLANA_KEYPAIR = tempKeypairPath;
  process.env.SOLANA_IDL_PATH = path.resolve(process.cwd(), "../backend/idl/subscription_royalty.json");
  process.env.SOLANA_STREAM_MAP = JSON.stringify({
    [STREAM_PRIVATE.id]: privateStreamPda.toBase58(),
    [STREAM_PUBLIC.id]: publicStreamPda.toBase58(),
  });

  const externalBackend = process.env.E2E_BACKEND_URL;
  if (externalBackend) {
    baseUrl = externalBackend.replace(/\/$/, "");
    return;
  }

  const { createApp } = await import("../../backend/src/app.ts");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind backend server");
  }
  startedServer = true;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!startedServer || !server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("E2E agents full flow", () => {
  it(
    "publishes and listens across private + public streams with delegated agents",
    { timeout: 240_000 },
    async () => {
      const client = createBackendClient(baseUrl);

      const u1 = loadKeypairFromFile(path.resolve(process.cwd(), "../accounts/user01.json"));
      const u2 = loadKeypairFromFile(path.resolve(process.cwd(), "../accounts/user02.json"));
      const u3 = loadKeypairFromFile(path.resolve(process.cwd(), "../accounts/user03.json"));
      const u4 = loadKeypairFromFile(path.resolve(process.cwd(), "../accounts/user04.json"));
      const u5 = loadKeypairFromFile(path.resolve(process.cwd(), "../accounts/user05.json"));

      const streamMap = JSON.parse(process.env.SOLANA_STREAM_MAP ?? "{}") as Record<string, string>;
      const privateStreamPda = new PublicKey(streamMap[STREAM_PRIVATE.id]);
      const publicStreamPda = new PublicKey(streamMap[STREAM_PUBLIC.id]);

      await createStream(baseUrl, {
        id: STREAM_PRIVATE.id,
        name: STREAM_PRIVATE.name,
        domain: STREAM_PRIVATE.domain,
        description: STREAM_PRIVATE.description,
        visibility: STREAM_PRIVATE.visibility,
        accuracy: STREAM_PRIVATE.accuracy,
        latency: STREAM_PRIVATE.latency,
        price: STREAM_PRIVATE.price,
        evidence: STREAM_PRIVATE.evidence,
        ownerWallet: u1.publicKey.toBase58(),
        tiers: [STREAM_PRIVATE.tier],
      });
      await createStream(baseUrl, {
        id: STREAM_PUBLIC.id,
        name: STREAM_PUBLIC.name,
        domain: STREAM_PUBLIC.domain,
        description: STREAM_PUBLIC.description,
        visibility: STREAM_PUBLIC.visibility,
        accuracy: STREAM_PUBLIC.accuracy,
        latency: STREAM_PUBLIC.latency,
        price: STREAM_PUBLIC.price,
        evidence: STREAM_PUBLIC.evidence,
        ownerWallet: u2.publicKey.toBase58(),
        tiers: [STREAM_PUBLIC.tier],
      });

      // U1 subscribes to public stream (so U1 can create agents)
      await subscribeOnchain({
        subscriber: u1,
        stream: publicStreamPda,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: STREAM_PUBLIC.tier.pricingType,
        evidenceLevel: STREAM_PUBLIC.tier.evidenceLevel,
        priceLamports: STREAM_PUBLIC.priceLamports,
        maker: u2.publicKey,
        treasury: u2.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PUBLIC.id, subscriberWallet: u1.publicKey.toBase58() });

      // U2 registers key + subscribes to private stream (so U2 can create agents)
      const u2Keys = SigintsClient.generateKeys();
      await registerSubscriptionKeyOnchain({
        subscriber: u2,
        stream: privateStreamPda,
        encPubKeyDerBase64: u2Keys.publicKeyDerBase64,
      });
      await client.syncWalletKey({
        wallet: u2.publicKey.toBase58(),
        streamId: STREAM_PRIVATE.id,
      });
      await subscribeOnchain({
        subscriber: u2,
        stream: privateStreamPda,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: STREAM_PRIVATE.tier.pricingType,
        evidenceLevel: STREAM_PRIVATE.tier.evidenceLevel,
        priceLamports: STREAM_PRIVATE.priceLamports,
        maker: u1.publicKey,
        treasury: u1.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PRIVATE.id, subscriberWallet: u2.publicKey.toBase58() });

      // Publisher agents + delegation
      const a1PublisherKeypair = Keypair.generate();
      const a2PublisherKeypair = Keypair.generate();
      await airdrop(connection, a1PublisherKeypair.publicKey, 1);
      await airdrop(connection, a2PublisherKeypair.publicKey, 1);

      const a1Publisher = await client.createAgent({
        ownerWallet: u1.publicKey.toBase58(),
        agentPubkey: a1PublisherKeypair.publicKey.toBase58(),
        name: "U1 Publisher",
        role: "maker",
        streamId: STREAM_PRIVATE.id,
        domain: "publisher",
        description: "U1 delegated publisher",
        evidence: "trust",
      });
      const a2Publisher = await client.createAgent({
        ownerWallet: u2.publicKey.toBase58(),
        agentPubkey: a2PublisherKeypair.publicKey.toBase58(),
        name: "U2 Publisher",
        role: "maker",
        streamId: STREAM_PUBLIC.id,
        domain: "publisher",
        description: "U2 delegated publisher",
        evidence: "trust",
      });

      const grantPrivateIx = await buildGrantPublisherInstruction({
        programId: STREAM_REGISTRY_PROGRAM_ID,
        stream: privateStreamPda,
        authority: u1.publicKey,
        agent: a1PublisherKeypair.publicKey,
      });
      const grantPrivateTx = new Transaction().add(grantPrivateIx);
      grantPrivateTx.feePayer = u1.publicKey;
      grantPrivateTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      await sendAndConfirmTransaction(connection, grantPrivateTx, [u1]);

      const grantPublicIx = await buildGrantPublisherInstruction({
        programId: STREAM_REGISTRY_PROGRAM_ID,
        stream: publicStreamPda,
        authority: u2.publicKey,
        agent: a2PublisherKeypair.publicKey,
      });
      const grantPublicTx = new Transaction().add(grantPublicIx);
      grantPublicTx.feePayer = u2.publicKey;
      grantPublicTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      await sendAndConfirmTransaction(connection, grantPublicTx, [u2]);

      // U3 fails to subscribe to private stream without key
      await expect(
        subscribeOnchain({
          subscriber: u3,
          stream: privateStreamPda,
          tierId: STREAM_PRIVATE.tier.tierId,
          pricingType: STREAM_PRIVATE.tier.pricingType,
          evidenceLevel: STREAM_PRIVATE.tier.evidenceLevel,
          priceLamports: STREAM_PRIVATE.priceLamports,
          maker: u1.publicKey,
          treasury: u1.publicKey,
        })
      ).rejects.toThrow();

      const u3Keys = SigintsClient.generateKeys();
      await registerSubscriptionKeyOnchain({
        subscriber: u3,
        stream: privateStreamPda,
        encPubKeyDerBase64: u3Keys.publicKeyDerBase64,
      });
      await client.syncWalletKey({
        wallet: u3.publicKey.toBase58(),
        streamId: STREAM_PRIVATE.id,
      });
      await subscribeOnchain({
        subscriber: u3,
        stream: privateStreamPda,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: STREAM_PRIVATE.tier.pricingType,
        evidenceLevel: STREAM_PRIVATE.tier.evidenceLevel,
        priceLamports: STREAM_PRIVATE.priceLamports,
        maker: u1.publicKey,
        treasury: u1.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PRIVATE.id, subscriberWallet: u3.publicKey.toBase58() });

      await subscribeOnchain({
        subscriber: u3,
        stream: publicStreamPda,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: STREAM_PUBLIC.tier.pricingType,
        evidenceLevel: STREAM_PUBLIC.tier.evidenceLevel,
        priceLamports: STREAM_PUBLIC.priceLamports,
        maker: u2.publicKey,
        treasury: u2.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PUBLIC.id, subscriberWallet: u3.publicKey.toBase58() });

      const u4Keys = SigintsClient.generateKeys();
      await registerSubscriptionKeyOnchain({
        subscriber: u4,
        stream: privateStreamPda,
        encPubKeyDerBase64: u4Keys.publicKeyDerBase64,
      });
      await client.syncWalletKey({
        wallet: u4.publicKey.toBase58(),
        streamId: STREAM_PRIVATE.id,
      });
      await subscribeOnchain({
        subscriber: u4,
        stream: privateStreamPda,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: STREAM_PRIVATE.tier.pricingType,
        evidenceLevel: STREAM_PRIVATE.tier.evidenceLevel,
        priceLamports: STREAM_PRIVATE.priceLamports,
        maker: u1.publicKey,
        treasury: u1.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PRIVATE.id, subscriberWallet: u4.publicKey.toBase58() });
      await subscribeOnchain({
        subscriber: u4,
        stream: publicStreamPda,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: STREAM_PUBLIC.tier.pricingType,
        evidenceLevel: STREAM_PUBLIC.tier.evidenceLevel,
        priceLamports: STREAM_PUBLIC.priceLamports,
        maker: u2.publicKey,
        treasury: u2.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PUBLIC.id, subscriberWallet: u4.publicKey.toBase58() });

      const u5Keys = SigintsClient.generateKeys();
      await registerSubscriptionKeyOnchain({
        subscriber: u5,
        stream: privateStreamPda,
        encPubKeyDerBase64: u5Keys.publicKeyDerBase64,
      });
      await client.syncWalletKey({
        wallet: u5.publicKey.toBase58(),
        streamId: STREAM_PRIVATE.id,
      });
      await subscribeOnchain({
        subscriber: u5,
        stream: privateStreamPda,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: STREAM_PRIVATE.tier.pricingType,
        evidenceLevel: STREAM_PRIVATE.tier.evidenceLevel,
        priceLamports: STREAM_PRIVATE.priceLamports,
        maker: u1.publicKey,
        treasury: u1.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PRIVATE.id, subscriberWallet: u5.publicKey.toBase58() });
      await subscribeOnchain({
        subscriber: u5,
        stream: publicStreamPda,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: STREAM_PUBLIC.tier.pricingType,
        evidenceLevel: STREAM_PUBLIC.tier.evidenceLevel,
        priceLamports: STREAM_PUBLIC.priceLamports,
        maker: u2.publicKey,
        treasury: u2.publicKey,
      });
      await client.registerSubscription({ streamId: STREAM_PUBLIC.id, subscriberWallet: u5.publicKey.toBase58() });

      const a3ListenerKeypair = Keypair.generate();
      const a4ListenerKeypair = Keypair.generate();
      const a5ListenerKeypair = Keypair.generate();

      const a3Listener = await client.createAgent({
        ownerWallet: u3.publicKey.toBase58(),
        agentPubkey: a3ListenerKeypair.publicKey.toBase58(),
        name: "U3 Listener",
        role: "listener",
        domain: "listener",
        description: "U3 listener",
        evidence: "trust",
      });
      const a4Listener = await client.createAgent({
        ownerWallet: u4.publicKey.toBase58(),
        agentPubkey: a4ListenerKeypair.publicKey.toBase58(),
        name: "U4 Listener",
        role: "listener",
        domain: "listener",
        description: "U4 listener",
        evidence: "trust",
      });
      const a5Listener = await client.createAgent({
        ownerWallet: u5.publicKey.toBase58(),
        agentPubkey: a5ListenerKeypair.publicKey.toBase58(),
        name: "U5 Listener",
        role: "listener",
        domain: "listener",
        description: "U5 listener",
        evidence: "trust",
      });

      await client.createAgentSubscription({
        ownerWallet: u3.publicKey.toBase58(),
        agentId: a3Listener.agent.id,
        streamId: STREAM_PRIVATE.id,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: "subscription_unlimited",
        evidenceLevel: "trust",
      });
      await client.createAgentSubscription({
        ownerWallet: u3.publicKey.toBase58(),
        agentId: a3Listener.agent.id,
        streamId: STREAM_PUBLIC.id,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: "subscription_unlimited",
        evidenceLevel: "trust",
        visibility: "public",
      });

      await client.createAgentSubscription({
        ownerWallet: u4.publicKey.toBase58(),
        agentId: a4Listener.agent.id,
        streamId: STREAM_PRIVATE.id,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: "subscription_unlimited",
        evidenceLevel: "trust",
      });
      await client.createAgentSubscription({
        ownerWallet: u4.publicKey.toBase58(),
        agentId: a4Listener.agent.id,
        streamId: STREAM_PUBLIC.id,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: "subscription_unlimited",
        evidenceLevel: "trust",
        visibility: "public",
      });

      await client.createAgentSubscription({
        ownerWallet: u5.publicKey.toBase58(),
        agentId: a5Listener.agent.id,
        streamId: STREAM_PRIVATE.id,
        tierId: STREAM_PRIVATE.tier.tierId,
        pricingType: "subscription_unlimited",
        evidenceLevel: "trust",
      });
      await client.createAgentSubscription({
        ownerWallet: u5.publicKey.toBase58(),
        agentId: a5Listener.agent.id,
        streamId: STREAM_PUBLIC.id,
        tierId: STREAM_PUBLIC.tier.tierId,
        pricingType: "subscription_unlimited",
        evidenceLevel: "trust",
        visibility: "public",
      });

      const rogueKeypair = Keypair.generate();
      const rogueAgent = await client.createAgent({
        ownerWallet: u3.publicKey.toBase58(),
        agentPubkey: rogueKeypair.publicKey.toBase58(),
        name: "U3 Rogue",
        role: "listener",
        domain: "listener",
        description: "Rogue agent",
        evidence: "trust",
      });

      const listeners = await Promise.all([
        createListener({
          agentId: a3Listener.agent.id,
          agentKeypair: a3ListenerKeypair,
          subscriberKeys: u3Keys,
          privateStreamPda,
          publicStreamPda,
        }),
        createListener({
          agentId: a4Listener.agent.id,
          agentKeypair: a4ListenerKeypair,
          subscriberKeys: u4Keys,
          privateStreamPda,
          publicStreamPda,
        }),
        createListener({
          agentId: a5Listener.agent.id,
          agentKeypair: a5ListenerKeypair,
          subscriberKeys: u5Keys,
          privateStreamPda,
          publicStreamPda,
        }),
      ]);

      let firstPublicMeta: Awaited<ReturnType<typeof prepareSignal>> | null = null;
      let firstPrivateMeta: Awaited<ReturnType<typeof prepareSignal>> | null = null;

      for (let i = 0; i < SIGNAL_COUNT; i += 1) {
        const privatePayload = `private:${i + 1}:${RUN_ID}`;
        const publicPayload = `public:${i + 1}:${RUN_ID}`;

        const [privateMeta, publicMeta] = await Promise.all([
          publishDelegatedSignal({
            streamId: STREAM_PRIVATE.id,
            tierId: STREAM_PRIVATE.tier.tierId,
            plaintext: privatePayload,
            visibility: "private",
            publisher: a1PublisherKeypair,
          }),
          publishDelegatedSignal({
            streamId: STREAM_PUBLIC.id,
            tierId: STREAM_PUBLIC.tier.tierId,
            plaintext: publicPayload,
            visibility: "public",
            publisher: a2PublisherKeypair,
          }),
        ]);

        if (i === 0) {
          firstPublicMeta = publicMeta;
          firstPrivateMeta = privateMeta;

          const stranger = Keypair.generate();
          const strangerClient = await SigintsClient.fromBackend(baseUrl, {
            keyboxAuth: {
              walletPubkey: stranger.publicKey.toBase58(),
              signMessage: (msg) => signMessage(stranger, msg),
            },
          });
          await expect(strangerClient.fetchPublic(publicMeta.signalPointer)).rejects.toThrow(/403/);

          const rogueClient = await SigintsClient.fromBackend(baseUrl, {
            agentAuth: {
              agentId: rogueAgent.agent.id,
              signMessage: (msg) => signMessage(rogueKeypair, msg),
            },
          });
          await expect(rogueClient.decryptSignal(privateMeta, u3Keys)).rejects.toThrow(/403/);
        }

        await sleep(SIGNAL_INTERVAL_MS);
      }

      if (!firstPublicMeta || !firstPrivateMeta) {
        throw new Error("Missing initial signal metadata");
      }

      await waitFor(
        () =>
          listeners.every((listener) =>
            listener.received.private.length >= SIGNAL_COUNT &&
            listener.received.public.length >= SIGNAL_COUNT
          ),
        120_000
      );

      const expectedPrivate = new Set(
        Array.from({ length: SIGNAL_COUNT }).map((_, idx) => `private:${idx + 1}:${RUN_ID}`)
      );
      const expectedPublic = new Set(
        Array.from({ length: SIGNAL_COUNT }).map((_, idx) => `public:${idx + 1}:${RUN_ID}`)
      );

      for (const listener of listeners) {
        const privateSignals = new Set(listener.received.private.map((signal) => signal.plaintext));
        const publicSignals = new Set(listener.received.public.map((signal) => signal.plaintext));
        expect(privateSignals).toEqual(expectedPrivate);
        expect(publicSignals).toEqual(expectedPublic);
        listener.stop();
      }
    }
  );
});

async function publishDelegatedSignal(args: {
  streamId: string;
  tierId: string;
  plaintext: string;
  visibility: "public" | "private";
  publisher: Keypair;
}): Promise<Awaited<ReturnType<typeof prepareSignal>>> {
  const metadata = await prepareSignal(baseUrl, {
    streamId: args.streamId,
    tierId: args.tierId,
    plaintext: args.plaintext,
    visibility: args.visibility,
  });
  const ix = await buildRecordSignalDelegatedInstruction({
    programId: PROGRAM_ID,
    streamRegistryProgramId: STREAM_REGISTRY_PROGRAM_ID,
    publisher: args.publisher.publicKey,
    streamId: args.streamId,
    metadata,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = args.publisher.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  await sendAndConfirmTransaction(connection, tx, [args.publisher]);
  return metadata;
}

async function createListener(args: {
  agentId: string;
  agentKeypair: Keypair;
  subscriberKeys: { publicKeyDerBase64: string; privateKeyDerBase64: string };
  privateStreamPda: PublicKey;
  publicStreamPda: PublicKey;
}) {
  const client = await SigintsClient.fromBackend(baseUrl, {
    agentAuth: {
      agentId: args.agentId,
      signMessage: (msg) => signMessage(args.agentKeypair, msg),
    },
  });
  const received = { private: [] as any[], public: [] as any[] };
  const stopPrivate = await client.listenForSignals({
    streamPubkey: args.privateStreamPda.toBase58(),
    streamId: STREAM_PRIVATE.id,
    subscriberKeys: args.subscriberKeys,
    onSignal: (signal) => {
      received.private.push(signal);
    },
  });
  const stopPublic = await client.listenForSignals({
    streamPubkey: args.publicStreamPda.toBase58(),
    streamId: STREAM_PUBLIC.id,
    onSignal: (signal) => {
      received.public.push(signal);
    },
  });
  return {
    client,
    received,
    stop: () => {
      stopPrivate();
      stopPublic();
    },
  };
}
