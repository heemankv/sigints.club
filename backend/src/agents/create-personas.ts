import dotenv from "dotenv";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const PERSONAS = [
  { id: "persona-eth", tiersSeed: "tiers:persona-eth" },
  { id: "persona-amazon", tiersSeed: "tiers:persona-amazon" },
  { id: "persona-anime", tiersSeed: "tiers:persona-anime" },
];

const UPSERT_TIER_DISCRIMINATOR = new Uint8Array([238, 232, 181, 0, 157, 149, 0, 202]);

const PERSONA_TIERS: Record<string, { tierId: string; pricingType: number; evidenceLevel: number; priceLamports: number; quota: number }> = {
  "persona-eth": { tierId: "tier-eth-trust", pricingType: 0, evidenceLevel: 0, priceLamports: 50_000_000, quota: 200 },
  "persona-amazon": { tierId: "tier-amz-trust", pricingType: 1, evidenceLevel: 0, priceLamports: 80_000_000, quota: 0 },
  "persona-anime": { tierId: "tier-anime-verifier", pricingType: 2, evidenceLevel: 1, priceLamports: 20_000_000, quota: 0 },
};

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

function sha256Bytes(input: string): Buffer {
  return createHash("sha256").update(input).digest();
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

function expandPath(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

async function loadKeypair(): Promise<Keypair> {
  if (process.env.SOLANA_PRIVATE_KEY) {
    const bs58 = (await import("bs58")).default;
    return Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
  }
  if (!process.env.SOLANA_KEYPAIR) {
    throw new Error("Set SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR in .env");
  }
  const raw = await fs.readFile(expandPath(process.env.SOLANA_KEYPAIR), "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function loadCoder(): Promise<anchor.BorshInstructionCoder> {
  const idlPath = path.resolve(process.cwd(), "idl", "persona_registry.json");
  const idlRaw = await fs.readFile(idlPath, "utf8");
  const idl = JSON.parse(idlRaw) as anchor.Idl;
  return new anchor.BorshInstructionCoder(idl);
}

async function updateEnvPersonaMap(map: Record<string, string>) {
  const envPath = path.resolve(process.cwd(), "..", ".env");
  let env = "";
  try {
    env = await fs.readFile(envPath, "utf8");
  } catch {
    env = "";
  }
  const line = `SOLANA_PERSONA_MAP=${JSON.stringify(map)}`;
  if (env.includes("SOLANA_PERSONA_MAP=")) {
    env = env.replace(/^SOLANA_PERSONA_MAP=.*$/m, line);
  } else {
    env = env.trimEnd() + "\n" + line + "\n";
  }
  await fs.writeFile(envPath, env);
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const programIdStr = process.env.SOLANA_PERSONA_REGISTRY_PROGRAM_ID;
  if (!programIdStr) {
    throw new Error("SOLANA_PERSONA_REGISTRY_PROGRAM_ID missing in .env");
  }
  const programId = new PublicKey(programIdStr);
  const keypair = await loadKeypair();
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const coder = await loadCoder();
  const treasury = process.env.SOLANA_TREASURY_ADDRESS
    ? new PublicKey(process.env.SOLANA_TREASURY_ADDRESS)
    : wallet.publicKey;

  const personaMap: Record<string, string> = {};

  for (const persona of PERSONAS) {
    const personaIdBytes = sha256Bytes(persona.id);
    const tiersHashBytes = sha256Bytes(persona.tiersSeed);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("persona"), personaIdBytes],
      programId
    );

    personaMap[persona.id] = pda.toBase58();
    const exists = await connection.getAccountInfo(pda);
    if (exists) {
      console.log(`Persona exists: ${persona.id} -> ${pda.toBase58()}`);
    } else {
      const data = coder.encode("create_persona", {
        persona_id: Array.from(personaIdBytes),
        tiers_hash: Array.from(tiersHashBytes),
        dao: treasury,
      });

      const ix = new anchor.web3.TransactionInstruction({
        programId,
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const tx = new anchor.web3.Transaction().add(ix);
      await provider.sendAndConfirm(tx);

      console.log(`Created persona: ${persona.id} -> ${pda.toBase58()}`);
    }
    const tier = PERSONA_TIERS[persona.id];
    if (tier) {
      const tierHash = sha256Bytes(tier.tierId);
      const [tierPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tier"), pda.toBuffer(), tierHash],
        programId
      );
      const tierExists = await connection.getAccountInfo(tierPda);
      if (!tierExists) {
        const tierData = encodeUpsertTierData({
          tierId: tier.tierId,
          pricingType: tier.pricingType,
          evidenceLevel: tier.evidenceLevel,
          priceLamports: tier.priceLamports,
          quota: tier.quota,
          status: 1,
        });
        const tierIx = new anchor.web3.TransactionInstruction({
          programId,
          keys: [
            { pubkey: pda, isSigner: false, isWritable: true },
            { pubkey: tierPda, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: tierData,
        });
        const tierTx = new anchor.web3.Transaction().add(tierIx);
        await provider.sendAndConfirm(tierTx);
        console.log(`Created tier: ${persona.id} -> ${tier.tierId}`);
      }
    }
  }

  await updateEnvPersonaMap(personaMap);
  console.log("Updated SOLANA_PERSONA_MAP in .env");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
