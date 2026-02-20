"use client";

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { sha256Bytes } from "./solana";
import { buildTiersSeed, TierInput } from "./tiersHash";

const CREATE_PERSONA_DISCRIMINATOR = new Uint8Array([113, 243, 215, 104, 47, 230, 240, 41]);

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
