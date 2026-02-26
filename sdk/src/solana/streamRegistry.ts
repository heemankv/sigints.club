import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { buildTiersSeed, type TierInput } from "./tiers.js";
import { sha256Bytes, writeBigInt64LE, writeUint32LE } from "./shared.js";

const CREATE_STREAM_DISCRIMINATOR = new Uint8Array([71, 188, 111, 127, 108, 40, 229, 158]);
const UPSERT_TIER_DISCRIMINATOR = new Uint8Array([238, 232, 181, 0, 157, 149, 0, 202]);

export async function deriveStreamIdBytes(streamId: string): Promise<Uint8Array> {
  return sha256Bytes(streamId);
}

export async function deriveStreamPda(programId: PublicKey, streamId: string): Promise<PublicKey> {
  const streamIdBytes = await deriveStreamIdBytes(streamId);
  return PublicKey.findProgramAddressSync([Buffer.from("stream"), Buffer.from(streamIdBytes)], programId)[0];
}

export async function buildTiersHash(tiers: TierInput[]): Promise<Uint8Array> {
  const seed = buildTiersSeed(tiers);
  return sha256Bytes(seed);
}

export async function deriveTierConfigPda(
  programId: PublicKey,
  stream: PublicKey,
  tierId: string
): Promise<PublicKey> {
  const tierHash = await sha256Bytes(tierId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), stream.toBuffer(), Buffer.from(tierHash)],
    programId
  )[0];
}

export function derivePublisherDelegatePda(
  programId: PublicKey,
  stream: PublicKey,
  agent: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("publisher"), stream.toBuffer(), agent.toBuffer()],
    programId
  )[0];
}

export async function buildCreateStreamInstruction(params: {
  programId: PublicKey;
  authority: PublicKey;
  streamId: string;
  tiers: TierInput[];
  dao?: string;
  visibility: "public" | "private";
}): Promise<{ instruction: TransactionInstruction; streamPda: PublicKey; tiersHash: Uint8Array }> {
  const streamIdBytes = await deriveStreamIdBytes(params.streamId);
  const tiersHash = await buildTiersHash(params.tiers);
  const daoPubkey = params.dao ? new PublicKey(params.dao) : params.authority;
  const visibility = params.visibility === "public" ? 0 : 1;
  const streamPda = PublicKey.findProgramAddressSync(
    [Buffer.from("stream"), Buffer.from(streamIdBytes)],
    params.programId
  )[0];
  const data = new Uint8Array(8 + 32 + 32 + 32 + 1);
  data.set(CREATE_STREAM_DISCRIMINATOR, 0);
  data.set(streamIdBytes, 8);
  data.set(tiersHash, 40);
  data.set(daoPubkey.toBytes(), 72);
  data[104] = visibility;
  const instruction = new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: streamPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
  return { instruction, streamPda, tiersHash };
}

export async function buildUpsertTierInstruction(params: {
  programId: PublicKey;
  authority: PublicKey;
  stream: PublicKey;
  tier: TierInput;
  priceLamports: number;
  quota: number;
  status?: number;
}): Promise<TransactionInstruction> {
  const tierHash = await sha256Bytes(params.tier.tierId);
  const tierPda = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), params.stream.toBuffer(), Buffer.from(tierHash)],
    params.programId
  )[0];
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 1);
  data.set(UPSERT_TIER_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = 1;
  data[41] = params.tier.evidenceLevel === "trust" ? 0 : 1;
  writeBigInt64LE(data, BigInt(params.priceLamports), 42);
  writeUint32LE(data, params.quota, 50);
  data[54] = params.status ?? 1;
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.stream, isSigner: false, isWritable: true },
      { pubkey: tierPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildGrantPublisherInstruction(params: {
  programId: PublicKey;
  stream: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
}): Promise<TransactionInstruction> {
  const discriminator = await anchorDiscriminator("grant_publisher");
  const delegatePda = derivePublisherDelegatePda(params.programId, params.stream, params.agent);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.stream, isSigner: false, isWritable: true },
      { pubkey: params.agent, isSigner: false, isWritable: false },
      { pubkey: delegatePda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(discriminator),
  });
}

export async function buildRevokePublisherInstruction(params: {
  programId: PublicKey;
  stream: PublicKey;
  authority: PublicKey;
  agent: PublicKey;
}): Promise<TransactionInstruction> {
  const discriminator = await anchorDiscriminator("revoke_publisher");
  const delegatePda = derivePublisherDelegatePda(params.programId, params.stream, params.agent);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.stream, isSigner: false, isWritable: true },
      { pubkey: params.agent, isSigner: false, isWritable: false },
      { pubkey: delegatePda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(discriminator),
  });
}

async function anchorDiscriminator(ixName: string): Promise<Uint8Array> {
  const hash = await sha256Bytes(`global:${ixName}`);
  return hash.slice(0, 8);
}
