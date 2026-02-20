import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { PersonaClient, __testing as sdkTesting, subscriberIdFromPubkey } from "../../sdk/src/index.ts";
import { webcrypto } from "node:crypto";
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import {
  decodeSubscriptionAccount,
  derivePersonaState,
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
const PERSONA_REGISTRY_PROGRAM_ID = new PublicKey(
  process.env.E2E_PERSONA_REGISTRY_PROGRAM_ID ??
    process.env.SOLANA_PERSONA_REGISTRY_PROGRAM_ID ??
    "5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi"
);
const UPSERT_TIER_DISCRIMINATOR = new Uint8Array([238, 232, 181, 0, 157, 149, 0, 202]);
const RUN_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
const TEST_PERSONAS = [
  {
    key: "eth",
    id: `persona-eth-${RUN_ID}`,
    tierId: "trust",
    pricingType: 0,
    evidenceLevel: 0,
    priceLamports: 50_000_000,
    quota: 0,
  },
  {
    key: "anime",
    id: `persona-anime-${RUN_ID}`,
    tierId: "verifier",
    pricingType: 1,
    evidenceLevel: 1,
    priceLamports: 20_000_000,
    quota: 0,
  },
  {
    key: "news",
    id: `persona-news-${RUN_ID}`,
    tierId: "trust",
    pricingType: 2,
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
  const registryInfo = await connection.getAccountInfo(PERSONA_REGISTRY_PROGRAM_ID);
  if (!registryInfo) {
    throw new Error("Persona registry not deployed on localnet. Deploy persona_registry before running E2E.");
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

function loadPersonaRegistryCoder(): anchor.BorshInstructionCoder {
  const idlPath = path.resolve(process.cwd(), "../backend/idl/persona_registry.json");
  const idlRaw = readFileSync(idlPath, "utf8");
  const idl = JSON.parse(idlRaw) as anchor.Idl;
  return new anchor.BorshInstructionCoder(idl);
}

async function ensurePersonaExists(args: {
  personaId: string;
  tiersSeed: string;
  authority: Keypair;
  coder: anchor.BorshInstructionCoder;
  dao?: PublicKey;
}): Promise<PublicKey> {
  const personaIdBytes = sha256Bytes(args.personaId);
  const tiersHashBytes = sha256Bytes(args.tiersSeed);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("persona"), personaIdBytes],
    PERSONA_REGISTRY_PROGRAM_ID
  );

  const exists = await connection.getAccountInfo(pda);
  if (exists) {
    return pda;
  }

  const data = args.coder.encode("create_persona", {
    persona_id: Array.from(personaIdBytes),
    tiers_hash: Array.from(tiersHashBytes),
    dao: args.dao ?? args.authority.publicKey,
  });

  const ix = new anchor.web3.TransactionInstruction({
    programId: PERSONA_REGISTRY_PROGRAM_ID,
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
  persona: PublicKey;
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
  persona: PublicKey;
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
    [Buffer.from("tier"), args.persona.toBuffer(), tierHash],
    PERSONA_REGISTRY_PROGRAM_ID
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
    programId: PERSONA_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: args.persona, isSigner: false, isWritable: true },
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

async function setPersonaStatus(args: {
  persona: PublicKey;
  tiersSeed: string;
  status: number;
  authority: Keypair;
  coder: anchor.BorshInstructionCoder;
}) {
  const tiersHashBytes = sha256Bytes(args.tiersSeed);
  const data = args.coder.encode("update_persona", {
    tiers_hash: Array.from(tiersHashBytes),
    status: args.status,
  });
  const ix = new anchor.web3.TransactionInstruction({
    programId: PERSONA_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: args.persona, isSigner: false, isWritable: true },
      { pubkey: args.authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [args.authority]);
}

async function sendSubscribeTx(args: {
  persona: PublicKey;
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
    persona: args.persona,
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
    const dir = mkdtempSync(path.join(tmpdir(), "persona-e2e-"));
    tempKeypairPath = path.join(dir, "backend-keypair.json");
    writeFileSync(tempKeypairPath, JSON.stringify(Array.from(keypair.secretKey)));
  }
  // eslint-disable-next-line no-console
  console.log("E2E authority keypair:", tempKeypairPath, keypair.publicKey.toBase58());
  authorityKeypair = keypair;
  await airdrop(connection, keypair.publicKey, 5);

  const coder = loadPersonaRegistryCoder();
  const personaMap: Record<string, string> = {};
  for (const persona of TEST_PERSONAS) {
    const pda = await ensurePersonaExists({
      personaId: persona.id,
      tiersSeed: `tiers:${persona.id}`,
      authority: keypair,
      coder,
    });
    personaMap[persona.id] = pda.toBase58();
    await ensureTierExists({
      persona: pda,
      tierId: persona.tierId,
      pricingType: persona.pricingType,
      evidenceLevel: persona.evidenceLevel,
      priceLamports: persona.priceLamports,
      quota: persona.quota,
      authority: keypair,
    });
  }

  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  process.env.SOLANA_RPC_URL = RPC_URL;
  process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID = PROGRAM_ID.toBase58();
  process.env.SOLANA_PERSONA_REGISTRY_PROGRAM_ID = PERSONA_REGISTRY_PROGRAM_ID.toBase58();
  process.env.SOLANA_KEYPAIR = tempKeypairPath;
  process.env.SOLANA_IDL_PATH = path.resolve(process.cwd(), "../backend/idl/subscription_royalty.json");
  process.env.SOLANA_PERSONA_MAP = JSON.stringify(personaMap);

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
  it("delivers ticks to SDK and MCP listeners with strict validation", async () => {
    const personas = TEST_PERSONAS.map((persona) => ({
      id: persona.id,
      tier: persona.tierId,
      pricingType: persona.pricingType,
      evidenceLevel: persona.evidenceLevel,
      priceLamports: persona.priceLamports,
      quota: persona.quota,
    }));

    const personaMap = JSON.parse(process.env.SOLANA_PERSONA_MAP ?? "{}") as Record<string, string>;
    const personaPubkeys = Object.fromEntries(
      personas.map((p) => [p.id, new PublicKey(personaMap[p.id])])
    ) as Record<string, PublicKey>;

    const takers = Array.from({ length: 10 }).map(() => ({
      wallet: Keypair.generate(),
      keys: PersonaClient.generateKeys(),
    }));

    // Fund takers and register encryption keys
    for (const taker of takers) {
      await airdrop(connection, taker.wallet.publicKey, 3);
    }

    // On-chain subscription NFTs
    for (const [idx, taker] of takers.entries()) {
      const persona = personas[idx % personas.length];
      const personaPubkey = personaPubkeys[persona.id];
      await sendSubscribeTx({
        persona: personaPubkey,
        subscriber: taker.wallet,
        maker: authorityKeypair.publicKey,
        treasury: authorityKeypair.publicKey,
        tierId: persona.tier,
        pricingType: persona.pricingType,
        evidenceLevel: persona.evidenceLevel,
        priceLamports: persona.priceLamports,
        quotaRemaining: persona.quota,
      });

      const subscriptionPda = deriveSubscriptionPda(PROGRAM_ID, personaPubkey, taker.wallet.publicKey);
      const subscriptionMint = deriveSubscriptionMint(PROGRAM_ID, personaPubkey, taker.wallet.publicKey);
      const account = await connection.getAccountInfo(subscriptionPda, "confirmed");
      expect(account).not.toBeNull();
      const decoded = decodeSubscriptionAccount(subscriptionPda, account!.data);
      expect(decoded).not.toBeNull();
      expect(decoded!.subscriber).toBe(taker.wallet.publicKey.toBase58());
      expect(decoded!.persona).toBe(personaPubkey.toBase58());
      expect(decoded!.pricingType).toBe(persona.pricingType);
      expect(decoded!.evidenceLevel).toBe(persona.evidenceLevel);
      expect(decoded!.quotaRemaining).toBe(0);
      expect(decoded!.status).toBe(0);
      expect(decoded!.nftMint).toBe(subscriptionMint.toBase58());
      const expectedTierHash = sha256Hex(Buffer.from(persona.tier, "utf8"));
      expect(decoded!.tierIdHex).toBe(expectedTierHash);

      const mint = await getMint(connection, subscriptionMint);
      expect(mint.decimals).toBe(0);
      expect(mint.supply).toBe(1n);
      expect(mint.mintAuthority).toBeNull();
      expect(mint.freezeAuthority).toBeNull();

      const ata = getAssociatedTokenAddressSync(subscriptionMint, taker.wallet.publicKey);
      const tokenAccount = await getAccount(connection, ata);
      expect(tokenAccount.amount).toBe(1n);
    }

    for (const [idx, taker] of takers.entries()) {
      const personaId = personas[idx % personas.length].id;
      const res = await fetch(`${baseUrl}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
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
    for (const persona of personas) {
      const personaPubkey = personaPubkeys[persona.id];
      const personaState = derivePersonaState(PROGRAM_ID, personaPubkey);
      const account = await connection.getAccountInfo(personaState, "confirmed");
      expect(account).not.toBeNull();
      const decoded = subscriptionCoder.decode("PersonaState", account!.data) as {
        persona: PublicKey;
        subscriptionCount?: anchor.BN;
        subscription_count?: anchor.BN;
        bump: number;
      };
      const subscriptionCount = decoded.subscriptionCount ?? decoded.subscription_count;
      const expectedCount = takers.filter((_, idx) => personas[idx % personas.length].id === persona.id).length;
      expect(decoded.persona.toBase58()).toBe(personaPubkey.toBase58());
      expect(subscriptionCount?.toNumber()).toBe(expectedCount);
      expect(decoded.bump).toBeGreaterThanOrEqual(0);
    }

    const actions: string[] = [];
    const receivedByTaker = new Map<string, { personaId: string; plaintext: string }>();
    const listenerErrors: string[] = [];
    const duplicateSignals: string[] = [];
    const tickStats: Array<{ createdAt: number; receivedAt: number }> = [];
    const listeners: Array<() => void> = [];

    for (const [idx, taker] of takers.entries()) {
      const persona = personas[idx % personas.length];
      const client = new PersonaClient({
        rpcUrl: RPC_URL,
        backendUrl: baseUrl,
        programId: PROGRAM_ID.toBase58(),
      });

      const stop = await client.listenForSignals({
        personaId: persona.id,
        personaPubkey: personaMap[persona.id],
        subscriberKeys: {
          publicKeyDerBase64: taker.keys.publicKeyDerBase64,
          privateKeyDerBase64: taker.keys.privateKeyDerBase64,
        },
        maxAgeMs: 60_000,
        includeBlockTime: true,
        onSignal: (tick) => {
          const takerId = taker.wallet.publicKey.toBase58();
          const expectedPlaintext = `${persona.id}-tick`;
          if (receivedByTaker.has(takerId)) {
            duplicateSignals.push(tick.signalHash);
            return;
          }
          if (tick.metadata.personaId !== persona.id) {
            listenerErrors.push(`persona mismatch for ${takerId}`);
          }
          if (tick.plaintext !== expectedPlaintext) {
            listenerErrors.push(`plaintext mismatch for ${takerId}`);
          }
          if (tick.ageMs < 0 || tick.ageMs > 60_000) {
            listenerErrors.push(`age out of range for ${takerId}`);
          }
          if (tick.receivedAt < tick.createdAt) {
            listenerErrors.push(`receivedAt before createdAt for ${takerId}`);
          }
          actions.push(`sdk:${takerId}:${tick.plaintext}`);
          receivedByTaker.set(takerId, { personaId: tick.metadata.personaId, plaintext: tick.plaintext });
          tickStats.push({ createdAt: tick.createdAt, receivedAt: tick.receivedAt });
        },
      });
      listeners.push(stop);
    }

    // MCP listener
    const { createServer } = await import("../../mcp-server/src/server.ts");
    const serverInstance = createServer((cfg) => new PersonaClient(cfg));
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
      name: "listen_persona_ticks",
      arguments: {
        personaId: personas[0].id,
        personaPubkey: personaMap[personas[0].id],
        subscriberPublicKeyBase64: takers[0].keys.publicKeyDerBase64,
        subscriberPrivateKeyBase64: takers[0].keys.privateKeyDerBase64,
        backendUrl: baseUrl,
        rpcUrl: RPC_URL,
        programId: PROGRAM_ID.toBase58(),
        maxAgeMs: 60_000,
      },
    });

    // Makers publish signals
    const published: Array<{ personaId: string; metadata: any }> = [];
    for (const persona of personas) {
      const payload = Buffer.from(`${persona.id}-tick`, "utf8").toString("base64");
      const res = await fetch(`${baseUrl}/signals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId: persona.id, tierId: persona.tier, plaintextBase64: payload }),
      });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { metadata: any };
      expect(body.metadata).toBeTruthy();
      expect(typeof body.metadata.signalHash).toBe("string");
      expect(body.metadata.signalHash).toHaveLength(64);
      expect(body.metadata.signalPointer).toBe(`backend://ciphertext/${body.metadata.signalHash}`);
      expect(body.metadata.keyboxPointer).toBe(`backend://keybox/${body.metadata.keyboxHash}`);
      expect(body.metadata.onchainTx).toBeTruthy();
      published.push({ personaId: persona.id, metadata: body.metadata });
    }

    await waitFor(() => receivedByTaker.size >= takers.length, 15_000, 300);
    await waitFor(() => mcpReceived, 10_000, 250);

    for (const item of published) {
      const meta = item.metadata;
      const latestRes = await fetch(`${baseUrl}/signals/latest?personaId=${encodeURIComponent(item.personaId)}`);
      expect(latestRes.ok).toBe(true);
      const latestBody = (await latestRes.json()) as { signal: any };
      expect(latestBody.signal.signalHash).toBe(meta.signalHash);

      const cipherRes = await fetch(`${baseUrl}/storage/ciphertext/${meta.signalHash}`);
      expect(cipherRes.ok).toBe(true);
      const cipherBody = (await cipherRes.json()) as { payload: any };
      const cipherHash = sha256Hex(Buffer.from(JSON.stringify(cipherBody.payload)));
      expect(cipherHash).toBe(meta.signalHash);

      const keyboxRes = await fetch(`${baseUrl}/storage/keybox/${meta.keyboxHash}`);
      expect(keyboxRes.ok).toBe(true);
      const keyboxBody = (await keyboxRes.json()) as { keybox: Record<string, any> };
      const keyboxHash = sha256Hex(Buffer.from(JSON.stringify(keyboxBody.keybox)));
      expect(keyboxHash).toBe(meta.keyboxHash);

      const matchingTakers = takers.filter((_, idx) => personas[idx % personas.length].id === item.personaId);
      for (const taker of matchingTakers) {
        const subscriberId = subscriberIdFromPubkey(taker.keys.publicKeyDerBase64);
        const entryRes = await fetch(
          `${baseUrl}/storage/keybox/${meta.keyboxHash}?subscriberId=${encodeURIComponent(subscriberId)}`
        );
        expect(entryRes.ok).toBe(true);
      }

      const personaPubkey = personaPubkeys[item.personaId];
      const signalHashBytes = Buffer.from(meta.signalHash, "hex");
      const [signalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("signal"), personaPubkey.toBuffer(), Buffer.from(signalHashBytes)],
        PROGRAM_ID
      );
      const signalAccount = await connection.getAccountInfo(signalPda, "confirmed");
      expect(signalAccount).not.toBeNull();
      const decoded = sdkTesting.decodeSignalRecord(signalAccount!.data);
      expect(decoded).not.toBeNull();
      expect(decoded!.persona).toBe(personaPubkey.toBase58());
      expect(decoded!.signalHash).toBe(meta.signalHash);
      expect(decoded!.keyboxHash).toBe(meta.keyboxHash);
      const signalPointerHash = sha256Hex(meta.signalPointer);
      const keyboxPointerHash = sha256Hex(meta.keyboxPointer);
      expect(decoded!.signalPointerHash).toBe(signalPointerHash);
      expect(decoded!.keyboxPointerHash).toBe(keyboxPointerHash);
      expect(Math.abs(decoded!.createdAt - meta.createdAt)).toBeLessThan(120_000);
    }

    const mcpResult = await mcpClient.callTool({
      name: "check_persona_tick",
      arguments: {
        personaId: personas[0].id,
        personaPubkey: personaMap[personas[0].id],
        subscriberPublicKeyBase64: takers[0].keys.publicKeyDerBase64,
        subscriberPrivateKeyBase64: takers[0].keys.privateKeyDerBase64,
        backendUrl: baseUrl,
        rpcUrl: RPC_URL,
        programId: PROGRAM_ID.toBase58(),
        maxAgeMs: 60_000,
      },
    });
    const contentText = mcpResult.content?.[0]?.type === "text" ? mcpResult.content[0].text : "";
    const parsed = contentText.startsWith("{") ? JSON.parse(contentText) : null;
    expect(parsed?.personaId).toBe(personas[0].id);
    expect(parsed?.plaintext).toBe(`${personas[0].id}-tick`);

    listeners.forEach((stop) => stop());

    expect(actions.length).toBe(takers.length);
    expect(receivedByTaker.size).toBe(takers.length);
    expect(listenerErrors).toEqual([]);
    expect(duplicateSignals).toEqual([]);
    expect(tickStats.some((t) => t.receivedAt - t.createdAt < 60_000)).toBe(true);
    expect(mcpReceived).toBe(true);
    expect(mcpPayload?.personaId).toBe(personas[0].id);
    expect(mcpPayload?.plaintext).toBe(`${personas[0].id}-tick`);
  });
});

describe("Subscription enforcement", () => {
  async function expectSubscribeFailure(args: {
    persona: PublicKey;
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
      args.persona,
      args.subscriber.publicKey
    );
    await expect(sendSubscribeTx(args)).rejects.toThrow();
    const account = await connection.getAccountInfo(subscriptionPda, "confirmed");
    expect(account).toBeNull();
  }

  it("charges subscriber and splits fee/maker payouts", async () => {
    const coder = loadPersonaRegistryCoder();
    const treasury = Keypair.generate();
    await airdrop(connection, treasury.publicKey, 1);
    const personaId = `persona-payment-${treasury.publicKey.toBase58().slice(0, 6)}`;
    const tiersSeed = `tiers:${personaId}`;
    const persona = await ensurePersonaExists({
      personaId,
      tiersSeed,
      authority: authorityKeypair,
      coder,
      dao: treasury.publicKey,
    });
    const tierId = "pro";
    const pricingType = 0;
    const evidenceLevel = 0;
    const priceLamports = 1_000_000;
    const quota = 0;
    await ensureTierExists({
      persona,
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
      persona,
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
    const coder = loadPersonaRegistryCoder();
    const personaId = "persona-enforce";
    const tiersSeed = "tiers:persona-enforce";
    const persona = await ensurePersonaExists({
      personaId,
      tiersSeed,
      authority: authorityKeypair,
      coder,
    });
    const tierId = "gold";
    const pricingType = 0;
    const evidenceLevel = 0;
    const priceLamports = 1_000_000;
    const quota = 0;
    await ensureTierExists({
      persona,
      tierId,
      pricingType,
      evidenceLevel,
      priceLamports,
      quota,
      authority: authorityKeypair,
    });

    const cases = [
      { label: "price mismatch", overrides: { priceLamports: priceLamports - 1 } },
      { label: "pricing type mismatch", overrides: { pricingType: 1 } },
      { label: "evidence mismatch", overrides: { evidenceLevel: 1 } },
      { label: "quota mismatch", overrides: { quotaRemaining: 5 } },
    ];

    for (const testCase of cases) {
      const subscriber = Keypair.generate();
      await airdrop(connection, subscriber.publicKey, 2);
      await expectSubscribeFailure({
        persona,
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
    const coder = loadPersonaRegistryCoder();
    const personaId = "persona-enforce-auth";
    const tiersSeed = "tiers:persona-enforce-auth";
    const persona = await ensurePersonaExists({
      personaId,
      tiersSeed,
      authority: authorityKeypair,
      coder,
    });
    const tierId = "basic";
    const pricingType = 0;
    const evidenceLevel = 0;
    const priceLamports = 2_000_000;
    const quota = 0;
    await ensureTierExists({
      persona,
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
      persona,
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
      persona,
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

  it("rejects inactive persona and inactive tier", async () => {
    const coder = loadPersonaRegistryCoder();

    const inactivePersonaId = "persona-inactive";
    const inactivePersonaSeed = "tiers:persona-inactive";
    const inactivePersona = await ensurePersonaExists({
      personaId: inactivePersonaId,
      tiersSeed: inactivePersonaSeed,
      authority: authorityKeypair,
      coder,
    });
    await ensureTierExists({
      persona: inactivePersona,
      tierId: "active",
      pricingType: 0,
      evidenceLevel: 0,
      priceLamports: 500_000,
      quota: 0,
      authority: authorityKeypair,
    });
    await setPersonaStatus({
      persona: inactivePersona,
      tiersSeed: inactivePersonaSeed,
      status: 0,
      authority: authorityKeypair,
      coder,
    });

    const inactivePersonaSubscriber = Keypair.generate();
    await airdrop(connection, inactivePersonaSubscriber.publicKey, 2);
    await expectSubscribeFailure({
      persona: inactivePersona,
      subscriber: inactivePersonaSubscriber,
      maker: authorityKeypair.publicKey,
      treasury: authorityKeypair.publicKey,
      tierId: "active",
      pricingType: 0,
      evidenceLevel: 0,
      priceLamports: 500_000,
      quotaRemaining: 0,
    });

    const tierInactivePersonaId = "persona-tierinactive";
    const tierInactiveSeed = "tiers:persona-tierinactive";
    const tierInactivePersona = await ensurePersonaExists({
      personaId: tierInactivePersonaId,
      tiersSeed: tierInactiveSeed,
      authority: authorityKeypair,
      coder,
    });
    await ensureTierWithStatus({
      persona: tierInactivePersona,
      tierId: "sleep",
      pricingType: 0,
      evidenceLevel: 0,
      priceLamports: 400_000,
      quota: 0,
      status: 0,
      authority: authorityKeypair,
    });

    const inactiveTierSubscriber = Keypair.generate();
    await airdrop(connection, inactiveTierSubscriber.publicKey, 2);
    await expectSubscribeFailure({
      persona: tierInactivePersona,
      subscriber: inactiveTierSubscriber,
      maker: authorityKeypair.publicKey,
      treasury: authorityKeypair.publicKey,
      tierId: "sleep",
      pricingType: 0,
      evidenceLevel: 0,
      priceLamports: 400_000,
      quotaRemaining: 0,
    });
  });
});
