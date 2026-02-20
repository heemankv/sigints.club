"use client";

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { sha256Bytes } from "./solana";
import { buildTiersSeed, TierInput } from "./tiersHash";

const CREATE_PERSONA_DISCRIMINATOR = new Uint8Array([113, 243, 215, 104, 47, 230, 240, 41]);
const UPSERT_TIER_DISCRIMINATOR = new Uint8Array([238, 232, 181, 0, 157, 149, 0, 202]);

export function resolvePersonaRegistryProgramId(): PublicKey {
  const programId =
    process.env.NEXT_PUBLIC_PERSONA_REGISTRY_PROGRAM_ID ??
    "5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi";
  return new PublicKey(programId);
}

export async function derivePersonaIdBytes(personaId: string): Promise<Uint8Array> {
  return sha256Bytes(personaId);
}

export async function derivePersonaPda(programId: PublicKey, personaId: string): Promise<PublicKey> {
  const personaIdBytes = await derivePersonaIdBytes(personaId);
  return PublicKey.findProgramAddressSync([Buffer.from("persona"), Buffer.from(personaIdBytes)], programId)[0];
}

export async function buildTiersHash(tiers: TierInput[]): Promise<Uint8Array> {
  const seed = buildTiersSeed(tiers);
  return sha256Bytes(seed);
}

export async function deriveTierConfigPda(programId: PublicKey, persona: PublicKey, tierId: string): Promise<PublicKey> {
  const tierHash = await sha256Bytes(tierId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), persona.toBuffer(), Buffer.from(tierHash)],
    programId
  )[0];
}

export async function buildCreatePersonaInstruction(params: {
  programId: PublicKey;
  authority: PublicKey;
  personaId: string;
  tiers: TierInput[];
  dao?: string;
}): Promise<{ instruction: TransactionInstruction; personaPda: PublicKey; tiersHash: Uint8Array }> {
  const personaIdBytes = await derivePersonaIdBytes(params.personaId);
  const tiersHash = await buildTiersHash(params.tiers);
  const daoPubkey = params.dao ? new PublicKey(params.dao) : params.authority;
  const personaPda = PublicKey.findProgramAddressSync(
    [Buffer.from("persona"), Buffer.from(personaIdBytes)],
    params.programId
  )[0];
  const data = new Uint8Array(8 + 32 + 32 + 32);
  data.set(CREATE_PERSONA_DISCRIMINATOR, 0);
  data.set(personaIdBytes, 8);
  data.set(tiersHash, 40);
  data.set(daoPubkey.toBytes(), 72);
  const instruction = new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: personaPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
  return { instruction, personaPda, tiersHash };
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

export async function buildUpsertTierInstruction(params: {
  programId: PublicKey;
  authority: PublicKey;
  persona: PublicKey;
  tier: TierInput;
  priceLamports: number;
  quota: number;
  status?: number;
}): Promise<TransactionInstruction> {
  const tierHash = await sha256Bytes(params.tier.tierId);
  const tierPda = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), params.persona.toBuffer(), Buffer.from(tierHash)],
    params.programId
  )[0];
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 1);
  data.set(UPSERT_TIER_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.tier.pricingType === "subscription_limited" ? 0 : params.tier.pricingType === "subscription_unlimited" ? 1 : 2;
  data[41] = params.tier.evidenceLevel === "trust" ? 0 : 1;
  writeBigInt64LE(data, BigInt(params.priceLamports), 42);
  writeUint32LE(data, params.quota, 50);
  data[54] = params.status ?? 1;
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.persona, isSigner: false, isWritable: true },
      { pubkey: tierPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}
