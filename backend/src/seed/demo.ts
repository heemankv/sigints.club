import "../env";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";
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
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { BackendStorage } from "../storage/providers/BackendStorage";
import { FileMetadata } from "../metadata/providers/FileMetadata";
import { FileSubscriberDirectory } from "../services/FileSubscriberDirectory";
import { FileUserStore, FileBotStore, FileSubscriptionStore, FileSocialPostStore } from "../social";
import { generateX25519Keypair, subscriberIdFromPubkey } from "../crypto/hybrid";
import { SignalService } from "../services/SignalService";
import { getTapestryClient } from "../tapestry";
import { SocialService } from "../services/SocialService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");
const bs58Codec = (bs58 as unknown as { default?: typeof bs58 }).default ?? bs58;
const SUBSCRIBE_DISCRIMINATOR = new Uint8Array([254, 28, 191, 138, 156, 179, 183, 53]);
const PRICING_TYPE_MAP: Record<string, number> = {
  subscription_limited: 0,
  subscription_unlimited: 1,
  per_signal: 2,
};
const EVIDENCE_LEVEL_MAP: Record<string, number> = {
  trust: 0,
  verifier: 1,
};

const personaSeeds = [
  { id: "persona-eth", tiersSeed: "tiers:persona-eth" },
  { id: "persona-amazon", tiersSeed: "tiers:persona-amazon" },
  { id: "persona-anime", tiersSeed: "tiers:persona-anime" },
];

const personaTiers: Record<string, { tierId: string; pricingType: "subscription_limited" | "subscription_unlimited" | "per_signal"; evidenceLevel: "trust" | "verifier" }> = {
  "persona-eth": { tierId: "tier-eth-trust", pricingType: "subscription_limited", evidenceLevel: "trust" },
  "persona-amazon": { tierId: "tier-amz-trust", pricingType: "subscription_unlimited", evidenceLevel: "trust" },
  "persona-anime": { tierId: "tier-anime-verifier", pricingType: "per_signal", evidenceLevel: "verifier" },
};

const signalTemplates: Record<string, string[]> = {
  "persona-eth": [
    "ETH best price: $2,512 on Kraken (spread 0.18%)",
    "ETH best price: $2,523 on Coinbase (depth 250k)",
    "ETH alert: volatility spike, maker confidence 0.92",
  ],
  "persona-amazon": [
    "Amazon drop: Echo Dot 5th Gen $29 (Prime)",
    "Amazon alert: SSD 1TB $49, deal ends in 2h",
  ],
  "persona-anime": [
    "One Piece ep 1103 drops today 19:30 UTC",
    "Jujutsu Kaisen S2 finale live in 45 min",
  ],
};

type SeedOptions = {
  force?: boolean;
  seedOnchain?: boolean;
  seedSocial?: boolean;
};

type DemoSummary = {
  createdAt: number;
  personas: Array<{ id: string; pda?: string }>;
  makerWallets: string[];
  listenerWallets: string[];
  subscriberKeys: Array<{ personaId: string; subscriberId: string; publicKeyBase64: string; privateKeyBase64: string }>;
  signals: Array<{ personaId: string; signalHash: string; onchainTx?: string }>;
  onchainSubscriptions: Array<{ personaId: string; subscriber: string; signature?: string }>;
  notes?: string[];
};

function envTrue(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
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

async function loadPersonaRegistryCoder(): Promise<anchor.BorshInstructionCoder> {
  const idlPath = path.resolve(backendRoot, "idl", "persona_registry.json");
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

async function ensureBalance(connection: Connection, pubkey: PublicKey, minSol = 1) {
  const balance = await connection.getBalance(pubkey, "confirmed");
  if (balance >= minSol * 1_000_000_000) return;
  const sig = await connection.requestAirdrop(pubkey, minSol * 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

async function ensurePersonaConfig(args: {
  connection: Connection;
  programId: PublicKey;
  authority: Keypair;
  personaId: string;
  tiersSeed: string;
  coder: anchor.BorshInstructionCoder;
}): Promise<PublicKey> {
  const personaIdBytes = sha256Bytes(args.personaId);
  const tiersHashBytes = sha256Bytes(args.tiersSeed);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("persona"), personaIdBytes],
    args.programId
  );
  const existing = await args.connection.getAccountInfo(pda);
  if (existing) return pda;

  const data = args.coder.encode("create_persona", {
    persona_id: Array.from(personaIdBytes),
    tiers_hash: Array.from(tiersHashBytes),
    dao: args.authority.publicKey,
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
}): Uint8Array {
  const tierHash = sha256Bytes(params.tierId);
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.expiresAtMs), 42);
  writeUint32LE(data, params.quotaRemaining, 50);
  return data;
}

function deriveSubscriptionPda(programId: PublicKey, persona: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), persona.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

function deriveSubscriptionMint(programId: PublicKey, persona: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription_mint"), persona.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

function derivePersonaState(programId: PublicKey, persona: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("persona_state"), persona.toBuffer()],
    programId
  );
  return pda;
}

async function sendSubscribeTx(args: {
  connection: Connection;
  programId: PublicKey;
  persona: PublicKey;
  subscriber: Keypair;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs?: number;
  quotaRemaining?: number;
}): Promise<string> {
  const data = encodeSubscribeData({
    tierId: args.tierId,
    pricingType: args.pricingType,
    evidenceLevel: args.evidenceLevel,
    expiresAtMs: args.expiresAtMs ?? defaultExpiryMs(),
    quotaRemaining: args.quotaRemaining ?? 0,
  });
  const subscription = deriveSubscriptionPda(args.programId, args.persona, args.subscriber.publicKey);
  const subscriptionMint = deriveSubscriptionMint(args.programId, args.persona, args.subscriber.publicKey);
  const personaState = derivePersonaState(args.programId, args.persona);
  const subscriberAta = getAssociatedTokenAddressSync(subscriptionMint, args.subscriber.publicKey);

  const ix = new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: subscription, isSigner: false, isWritable: true },
      { pubkey: subscriptionMint, isSigner: false, isWritable: true },
      { pubkey: personaState, isSigner: false, isWritable: true },
      { pubkey: subscriberAta, isSigner: false, isWritable: true },
      { pubkey: args.persona, isSigner: false, isWritable: false },
      { pubkey: args.subscriber.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
  persona: PublicKey;
  authority: Keypair;
  coder: anchor.BorshInstructionCoder;
  signalHash: string;
  signalPointer: string;
  keyboxHash: string;
  keyboxPointer: string;
}): Promise<string> {
  const signalHashBytes = toBytes32(args.signalHash, "signalHash");
  const signalPointerHash = sha256Hex(Buffer.from(args.signalPointer));
  const keyboxPointerHash = sha256Hex(Buffer.from(args.keyboxPointer));
  const signalPointerHashBytes = toBytes32(signalPointerHash, "signalPointerHash");
  const keyboxHashBytes = toBytes32(args.keyboxHash, "keyboxHash");
  const keyboxPointerHashBytes = toBytes32(keyboxPointerHash, "keyboxPointerHash");

  const [signalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("signal"), args.persona.toBuffer(), Buffer.from(signalHashBytes)],
    args.programId
  );
  const [personaState] = PublicKey.findProgramAddressSync(
    [Buffer.from("persona_state"), args.persona.toBuffer()],
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
      { pubkey: args.persona, isSigner: false, isWritable: false },
      { pubkey: personaState, isSigner: false, isWritable: false },
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
  const markerPath = path.resolve(backendRoot, "data", "demo_seed.json");
  if (!options.force && (await fileExists(markerPath))) {
    // eslint-disable-next-line no-console
    console.log("Demo seed already exists. Set SEED_DEMO_FORCE=true to regenerate.");
    return;
  }
  if (options.force) {
    const dataDir = path.resolve(backendRoot, "data");
    const storageDir = path.resolve(backendRoot, "storage");
    await fs.rm(path.join(dataDir, "metadata.json"), { force: true });
    await fs.rm(path.join(dataDir, "subscribers.json"), { force: true });
    await fs.rm(path.join(dataDir, "users.json"), { force: true });
    await fs.rm(path.join(dataDir, "bots.json"), { force: true });
    await fs.rm(path.join(dataDir, "subscriptions.json"), { force: true });
    await fs.rm(path.join(dataDir, "social_posts.json"), { force: true });
    await fs.rm(path.join(storageDir, "ciphertext"), { recursive: true, force: true });
    await fs.rm(path.join(storageDir, "keybox"), { recursive: true, force: true });
  }

  const storage = new BackendStorage(path.resolve(backendRoot, "storage"));
  const metadata = new FileMetadata(path.resolve(backendRoot, "data", "metadata.json"));
  const subscribers = new FileSubscriberDirectory(path.resolve(backendRoot, "data", "subscribers.json"));
  const userStore = new FileUserStore(path.resolve(backendRoot, "data", "users.json"));
  const botStore = new FileBotStore(path.resolve(backendRoot, "data", "bots.json"));
  const subscriptionStore = new FileSubscriptionStore(path.resolve(backendRoot, "data", "subscriptions.json"));
  const socialPostStore = new FileSocialPostStore(path.resolve(backendRoot, "data", "social_posts.json"));

  const seedOnchain = options.seedOnchain ?? true;
  const seedSocial = options.seedSocial ?? false;

  const makerWallets = Array.from({ length: 3 }).map(() => Keypair.generate());
  const listenerWallets = Array.from({ length: 10 }).map(() => Keypair.generate());

  for (const [idx, maker] of makerWallets.entries()) {
    await userStore.upsertUser(maker.publicKey.toBase58(), {
      displayName: `Maker ${idx + 1}`,
      bio: "Seeded maker persona for demo flows.",
    });
  }

  for (const [idx, listener] of listenerWallets.entries()) {
    await userStore.upsertUser(listener.publicKey.toBase58(), {
      displayName: `Listener ${idx + 1}`,
      bio: "Seeded listener agent for demo flows.",
    });
  }

  const makerBots = await Promise.all(
    personaSeeds.map((persona, idx) =>
      botStore.createBot({
        ownerWallet: makerWallets[idx % makerWallets.length].publicKey.toBase58(),
        name: `${persona.id.replace("persona-", "")} Scout`,
        role: "maker",
        domain: persona.id.includes("eth") ? "pricing" : persona.id.includes("amazon") ? "commerce" : "media",
        description: `Seeded maker bot for ${persona.id}.`,
        evidence: persona.id.includes("anime") ? "trust" : "verifier",
        tiers: [
          {
            tierId: personaTiers[persona.id].tierId,
            pricingType: personaTiers[persona.id].pricingType,
            price: "$5/mo",
            evidenceLevel: personaTiers[persona.id].evidenceLevel,
          },
        ],
      })
    )
  );

  const listenerBots = await Promise.all(
    listenerWallets.map((wallet, idx) =>
      botStore.createBot({
        ownerWallet: wallet.publicKey.toBase58(),
        name: `Listener-${idx + 1}`,
        role: "listener",
        domain: "automation",
        description: "Seeded listener bot for demo flows.",
        evidence: "trust",
      })
    )
  );

  for (const [idx, bot] of listenerBots.entries()) {
    const makerBot = makerBots[idx % makerBots.length];
    const persona = personaSeeds[idx % personaSeeds.length];
    const tier = personaTiers[persona.id];
    await subscriptionStore.createSubscription({
      listenerWallet: bot.ownerWallet,
      botId: makerBot.id,
      tierId: tier.tierId,
      pricingType: tier.pricingType,
      evidenceLevel: tier.evidenceLevel,
    });
  }

  const subscriberKeys: DemoSummary["subscriberKeys"] = [];
  for (const [idx, listener] of listenerWallets.entries()) {
    const persona = personaSeeds[idx % personaSeeds.length];
    const keys = generateX25519Keypair();
    const encPub = keys.publicKey.toString("base64");
    const subscriberId = subscriberIdFromPubkey(keys.publicKey);
    await subscribers.addSubscriber({
      personaId: persona.id,
      subscriberId,
      encPubKeyDerBase64: encPub,
    });
    subscriberKeys.push({
      personaId: persona.id,
      subscriberId,
      publicKeyBase64: encPub,
      privateKeyBase64: keys.privateKey.toString("base64"),
    });
  }

  let personaMap: Record<string, string> | undefined;
  const onchainSubscriptions: DemoSummary["onchainSubscriptions"] = [];
  let chainConnection: Connection | undefined;
  let chainProgramId: PublicKey | undefined;
  let chainAuthority: Keypair | undefined;
  let chainCoder: anchor.BorshInstructionCoder | undefined;

  if (seedOnchain) {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
    const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
    const personaRegistryProgramId = process.env.SOLANA_PERSONA_REGISTRY_PROGRAM_ID;

    if (!subscriptionProgramId || !personaRegistryProgramId) {
      // eslint-disable-next-line no-console
      console.warn("Missing SOLANA_SUBSCRIPTION_PROGRAM_ID or SOLANA_PERSONA_REGISTRY_PROGRAM_ID. Skipping on-chain seeding.");
    } else {
      const connection = new Connection(rpcUrl, "confirmed");
      const programId = new PublicKey(subscriptionProgramId);
      const registryProgramId = new PublicKey(personaRegistryProgramId);
      const programAccount = await connection.getAccountInfo(programId);
      const registryAccount = await connection.getAccountInfo(registryProgramId);
      if (!programAccount || !registryAccount) {
        // eslint-disable-next-line no-console
        console.warn("On-chain programs not deployed on target RPC. Skipping on-chain seeding.");
      } else {
        const authority = await loadAuthorityKeypair();
        if (isLocalnet(rpcUrl)) {
          await ensureBalance(connection, authority.publicKey, 3);
        }
        const coder = await loadPersonaRegistryCoder();
        personaMap = {};
        for (const persona of personaSeeds) {
          const pda = await ensurePersonaConfig({
            connection,
            programId: registryProgramId,
            authority,
            personaId: persona.id,
            tiersSeed: persona.tiersSeed,
            coder,
          });
          personaMap[persona.id] = pda.toBase58();
        }

        chainConnection = connection;
        chainProgramId = programId;
        chainAuthority = authority;
        chainCoder = await loadSubscriptionCoder();

        for (const [idx, listener] of listenerWallets.entries()) {
          if (isLocalnet(rpcUrl)) {
            await ensureBalance(connection, listener.publicKey, 2);
          }
          const persona = personaSeeds[idx % personaSeeds.length];
          const tier = personaTiers[persona.id];
          try {
            const personaPda = personaMap?.[persona.id];
            if (!personaPda) {
              throw new Error(`Missing persona PDA for ${persona.id}`);
            }
            const signature = await sendSubscribeTx({
              connection,
              programId,
              persona: new PublicKey(personaPda),
              subscriber: listener,
              tierId: tier.tierId,
              pricingType: PRICING_TYPE_MAP[tier.pricingType],
              evidenceLevel: EVIDENCE_LEVEL_MAP[tier.evidenceLevel],
            });
            onchainSubscriptions.push({
              personaId: persona.id,
              subscriber: listener.publicKey.toBase58(),
              signature,
            });
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("On-chain subscribe failed", error);
            onchainSubscriptions.push({
              personaId: persona.id,
              subscriber: listener.publicKey.toBase58(),
            });
          }
        }
      }
    }
  }

  const signalService = new SignalService(storage, metadata);
  const signals: DemoSummary["signals"] = [];
  for (const persona of personaSeeds) {
    const tier = personaTiers[persona.id];
    const messages = signalTemplates[persona.id] ?? [];
    const personaSubscribers = await subscribers.listSubscribers(persona.id);
    for (const message of messages) {
      const publish = await signalService.publishSignal(
        persona.id,
        tier.tierId,
        Buffer.from(message, "utf8"),
        personaSubscribers.map((s) => ({ encPubKeyDerBase64: s.encPubKeyDerBase64 }))
      );
      let onchainTx: string | undefined;
      if (seedOnchain && chainConnection && chainProgramId && chainAuthority && chainCoder && personaMap?.[persona.id]) {
        try {
          onchainTx = await recordSignalOnchain({
            connection: chainConnection,
            programId: chainProgramId,
            persona: new PublicKey(personaMap[persona.id]),
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
        personaId: persona.id,
        signalHash: publish.metadata.signalHash,
        onchainTx: onchainTx ?? publish.metadata.onchainTx,
      });
    }
  }

  if (seedSocial && process.env.TAPESTRY_API_KEY) {
    try {
      const client = getTapestryClient();
      const social = new SocialService(client, socialPostStore, userStore);
      for (const persona of personaSeeds) {
        const makerWallet = makerWallets[0]?.publicKey.toBase58();
        await social.createIntent({
          wallet: makerWallet,
          content: `Looking for ${persona.id} live alerts`,
          personaId: persona.id,
          tags: ["seed", "intent"],
          displayName: "Seed Maker",
        });
      }
      await social.createSlashReport({
        wallet: makerWallets[0]?.publicKey.toBase58(),
        content: "Seeded slash report for demo review.",
        personaId: "persona-eth",
        severity: "low",
        displayName: "Seed Validator",
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Social seeding failed", error);
    }
  }

  const summary: DemoSummary = {
    createdAt: Date.now(),
    personas: personaSeeds.map((p) => ({ id: p.id, pda: personaMap?.[p.id] })),
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
  });
}

if (process.argv[1] === __filename) {
  seedDemoData({
    force: process.argv.includes("--force"),
    seedOnchain: envTrue("SEED_DEMO_ONCHAIN", true),
    seedSocial: envTrue("SEED_DEMO_SOCIAL", Boolean(process.env.TAPESTRY_API_KEY)),
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
