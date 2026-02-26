import type { BlockhashWithExpiryBlockHeight, Connection } from "@solana/web3.js";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import type { TierInput } from "./solana/tiers.js";
import {
  buildCreateStreamInstruction,
  buildGrantPublisherInstruction,
  buildRevokePublisherInstruction,
  buildUpsertTierInstruction,
} from "./solana/streamRegistry.js";
import {
  buildRegisterSubscriptionKeyInstruction,
  buildSubscribeInstruction,
} from "./solana/subscription.js";
import {
  buildRecordSignalDelegatedInstruction,
  buildRecordSignalInstruction,
  type RecordSignalDelegatedParams,
  type RecordSignalParams,
} from "./publish.js";

export type PublicKeyLike = string | PublicKey;

export type BuiltTransaction = {
  transaction: Transaction;
  latestBlockhash: BlockhashWithExpiryBlockHeight;
};

export type UpsertTierInput = {
  tier: TierInput;
  priceLamports: number;
  quota: number;
  status?: number;
};

function toPublicKey(value: PublicKeyLike): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function toPublicKeyOptional(value?: PublicKeyLike): PublicKey | undefined {
  if (!value) return undefined;
  return toPublicKey(value);
}

async function buildTransaction(
  connection: Connection,
  feePayer: PublicKeyLike,
  instructions: TransactionInstruction[]
): Promise<BuiltTransaction> {
  const tx = new Transaction();
  for (const ix of instructions) {
    tx.add(ix);
  }
  tx.feePayer = toPublicKey(feePayer);
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  return { transaction: tx, latestBlockhash };
}

export async function buildCreateStreamTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  authority: PublicKeyLike;
  streamId: string;
  tiers: TierInput[];
  dao?: string;
  visibility: "public" | "private";
}): Promise<BuiltTransaction & { streamPda: PublicKey; tiersHash: Uint8Array }> {
  const programId = toPublicKey(params.programId);
  const authority = toPublicKey(params.authority);
  const { instruction, streamPda, tiersHash } = await buildCreateStreamInstruction({
    programId,
    authority,
    streamId: params.streamId,
    tiers: params.tiers,
    dao: params.dao,
    visibility: params.visibility,
  });
  const built = await buildTransaction(params.connection, authority, [instruction]);
  return { ...built, streamPda, tiersHash };
}

export async function buildUpsertTiersTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  authority: PublicKeyLike;
  stream: PublicKeyLike;
  tiers: UpsertTierInput[];
}): Promise<BuiltTransaction> {
  const programId = toPublicKey(params.programId);
  const authority = toPublicKey(params.authority);
  const stream = toPublicKey(params.stream);
  const instructions = await Promise.all(
    params.tiers.map((tier) =>
      buildUpsertTierInstruction({
        programId,
        authority,
        stream,
        tier: tier.tier,
        priceLamports: tier.priceLamports,
        quota: tier.quota,
        status: tier.status,
      })
    )
  );
  return buildTransaction(params.connection, authority, instructions);
}

export async function buildSubscribeTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  streamRegistryProgramId: PublicKeyLike;
  stream: PublicKeyLike;
  subscriber: PublicKeyLike;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
  maker: PublicKeyLike;
  treasury: PublicKeyLike;
}): Promise<BuiltTransaction> {
  const instruction = await buildSubscribeInstruction({
    programId: toPublicKey(params.programId),
    streamRegistryProgramId: toPublicKey(params.streamRegistryProgramId),
    stream: toPublicKey(params.stream),
    subscriber: toPublicKey(params.subscriber),
    tierId: params.tierId,
    pricingType: params.pricingType,
    evidenceLevel: params.evidenceLevel,
    expiresAtMs: params.expiresAtMs,
    quotaRemaining: params.quotaRemaining,
    priceLamports: params.priceLamports,
    maker: toPublicKey(params.maker),
    treasury: toPublicKey(params.treasury),
  });
  return buildTransaction(params.connection, params.subscriber, [instruction]);
}

export async function buildRegisterSubscriptionKeyTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  stream: PublicKeyLike;
  subscriber: PublicKeyLike;
  encPubKeyBase64: string;
}): Promise<BuiltTransaction> {
  const instruction = buildRegisterSubscriptionKeyInstruction({
    programId: toPublicKey(params.programId),
    stream: toPublicKey(params.stream),
    subscriber: toPublicKey(params.subscriber),
    encPubKeyBase64: params.encPubKeyBase64,
  });
  return buildTransaction(params.connection, params.subscriber, [instruction]);
}

export async function buildRecordSignalTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  streamRegistryProgramId: PublicKeyLike;
  authority: PublicKeyLike;
  streamId?: string;
  streamPubkey?: PublicKeyLike;
  metadata: RecordSignalParams["metadata"];
}): Promise<BuiltTransaction> {
  const instruction = await buildRecordSignalInstruction({
    programId: toPublicKey(params.programId),
    streamRegistryProgramId: toPublicKey(params.streamRegistryProgramId),
    authority: toPublicKey(params.authority),
    streamId: params.streamId,
    streamPubkey: toPublicKeyOptional(params.streamPubkey),
    metadata: params.metadata,
  });
  return buildTransaction(params.connection, params.authority, [instruction]);
}

export async function buildRecordSignalDelegatedTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  streamRegistryProgramId: PublicKeyLike;
  publisher: PublicKeyLike;
  streamId?: string;
  streamPubkey?: PublicKeyLike;
  metadata: RecordSignalDelegatedParams["metadata"];
}): Promise<BuiltTransaction> {
  const instruction = await buildRecordSignalDelegatedInstruction({
    programId: toPublicKey(params.programId),
    streamRegistryProgramId: toPublicKey(params.streamRegistryProgramId),
    publisher: toPublicKey(params.publisher),
    streamId: params.streamId,
    streamPubkey: toPublicKeyOptional(params.streamPubkey),
    metadata: params.metadata,
  });
  return buildTransaction(params.connection, params.publisher, [instruction]);
}

export async function buildGrantPublisherTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  stream: PublicKeyLike;
  authority: PublicKeyLike;
  agent: PublicKeyLike;
}): Promise<BuiltTransaction> {
  const instruction = await buildGrantPublisherInstruction({
    programId: toPublicKey(params.programId),
    stream: toPublicKey(params.stream),
    authority: toPublicKey(params.authority),
    agent: toPublicKey(params.agent),
  });
  return buildTransaction(params.connection, params.authority, [instruction]);
}

export async function buildRevokePublisherTransaction(params: {
  connection: Connection;
  programId: PublicKeyLike;
  stream: PublicKeyLike;
  authority: PublicKeyLike;
  agent: PublicKeyLike;
}): Promise<BuiltTransaction> {
  const instruction = await buildRevokePublisherInstruction({
    programId: toPublicKey(params.programId),
    stream: toPublicKey(params.stream),
    authority: toPublicKey(params.authority),
    agent: toPublicKey(params.agent),
  });
  return buildTransaction(params.connection, params.authority, [instruction]);
}
