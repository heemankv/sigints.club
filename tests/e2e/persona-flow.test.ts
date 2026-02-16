import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { PersonaClient } from "../../sdk/src/index.ts";
import { webcrypto } from "node:crypto";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createHash } from "node:crypto";

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

let connection: Connection;
let server: Server;
let baseUrl: string;
let tempKeypairPath: string;

async function airdrop(connection: Connection, pubkey: PublicKey, sol = 2) {
  const sig = await connection.requestAirdrop(pubkey, sol * 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
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
    dao: args.authority.publicKey,
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

async function sendSubscribeTx(args: {
  persona: PublicKey;
  subscriber: Keypair;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
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
    quotaRemaining: 0,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = args.subscriber.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  await sendAndConfirmTransaction(connection, tx, [args.subscriber]);
}

beforeAll(async () => {
  await ensureLocalnet();

  const keypair = Keypair.generate();
  await airdrop(connection, keypair.publicKey, 5);

  const dir = mkdtempSync(path.join(tmpdir(), "persona-e2e-"));
  tempKeypairPath = path.join(dir, "backend-keypair.json");
  writeFileSync(tempKeypairPath, JSON.stringify(Array.from(keypair.secretKey)));

  const coder = loadPersonaRegistryCoder();
  const personaSpecs = [
    { id: "persona-eth", tiersSeed: "tiers:persona-eth" },
    { id: "persona-anime", tiersSeed: "tiers:persona-anime" },
    { id: "persona-news", tiersSeed: "tiers:persona-news" },
  ];
  const personaMap: Record<string, string> = {};
  for (const spec of personaSpecs) {
    const pda = await ensurePersonaExists({
      personaId: spec.id,
      tiersSeed: spec.tiersSeed,
      authority: keypair,
      coder,
    });
    personaMap[spec.id] = pda.toBase58();
  }

  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  process.env.SOLANA_RPC_URL = RPC_URL;
  process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID = PROGRAM_ID.toBase58();
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
  it("delivers ticks to SDK and MCP listeners", async () => {
    const personas = [
      { id: "persona-eth", tier: "trust", pricingType: 0, evidenceLevel: 0 },
      { id: "persona-anime", tier: "verifier", pricingType: 1, evidenceLevel: 1 },
      { id: "persona-news", tier: "trust", pricingType: 2, evidenceLevel: 0 },
    ];

    const personaMap = JSON.parse(process.env.SOLANA_PERSONA_MAP ?? "{}") as Record<string, string>;

    const takers = Array.from({ length: 10 }).map(() => ({
      wallet: Keypair.generate(),
      keys: PersonaClient.generateKeys(),
    }));

    // Fund takers and register encryption keys
    for (const taker of takers) {
      await airdrop(connection, taker.wallet.publicKey, 2);
    }

    for (const [idx, taker] of takers.entries()) {
      const personaId = personas[idx % personas.length].id;
      await fetch(`${baseUrl}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, encPubKeyDerBase64: taker.keys.publicKeyDerBase64 }),
      });
    }

    // On-chain subscription NFTs
    for (const [idx, taker] of takers.entries()) {
      const persona = personas[idx % personas.length];
      await sendSubscribeTx({
        persona: new PublicKey(personaMap[persona.id]),
        subscriber: taker.wallet,
        tierId: persona.tier,
        pricingType: persona.pricingType,
        evidenceLevel: persona.evidenceLevel,
      });
    }

    const actions: string[] = [];
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
          actions.push(`sdk:${taker.wallet.publicKey.toBase58()}:${tick.plaintext}`);
          tickStats.push({ createdAt: tick.createdAt, receivedAt: tick.receivedAt });
        },
      });
      listeners.push(stop);
    }

    // MCP listener
    const { createServer } = await import("../../mcp-server/src/server.ts");
    const serverInstance = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client(
      { name: "e2e-client", version: "0.1.0" },
      { capabilities: { logging: {} } }
    );
    await serverInstance.connect(serverTransport);
    await mcpClient.connect(clientTransport);

    let mcpReceived = false;
    mcpClient.setNotificationHandler(LoggingMessageNotificationSchema, (note) => {
      if (note.params?.data?.signalHash) {
        mcpReceived = true;
      }
    });

    await mcpClient.callTool({
      name: "listen_persona_ticks",
      arguments: {
        personaId: "persona-eth",
        personaPubkey: personaMap["persona-eth"],
        subscriberPublicKeyBase64: takers[0].keys.publicKeyDerBase64,
        subscriberPrivateKeyBase64: takers[0].keys.privateKeyDerBase64,
        backendUrl: baseUrl,
        rpcUrl: RPC_URL,
        programId: PROGRAM_ID.toBase58(),
        maxAgeMs: 60_000,
      },
    });

    // Makers publish signals
    for (const persona of personas) {
      const payload = Buffer.from(`${persona.id}-tick`, "utf8").toString("base64");
      const res = await fetch(`${baseUrl}/signals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId: persona.id, tierId: persona.tier, plaintextBase64: payload }),
      });
      expect(res.ok).toBe(true);
    }

    await waitFor(() => actions.length >= takers.length, 15_000, 300);

    listeners.forEach((stop) => stop());

    expect(actions.length).toBeGreaterThanOrEqual(10);
    expect(tickStats.some((t) => t.receivedAt - t.createdAt < 60_000)).toBe(true);
    expect(mcpReceived).toBe(true);
  });
});
