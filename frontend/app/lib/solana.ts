"use client";

import { PublicKey, type Connection } from "@solana/web3.js";
import { STREAM_REGISTRY_PROGRAM_ID, SUBSCRIPTION_PROGRAM_ID } from "./constants";
import {
  buildCreateStreamTransaction as sdkBuildCreateStreamTransaction,
  buildGrantPublisherTransaction as sdkBuildGrantPublisherTransaction,
  buildRecordSignalTransaction as sdkBuildRecordSignalTransaction,
  buildRegisterSubscriptionKeyTransaction as sdkBuildRegisterSubscriptionKeyTransaction,
  buildRevokePublisherTransaction as sdkBuildRevokePublisherTransaction,
  buildSubscribeTransaction as sdkBuildSubscribeTransaction,
  buildUpsertTiersTransaction as sdkBuildUpsertTiersTransaction,
  type BuiltTransaction,
  type UpsertTierInput,
} from "@sigints/sdk/src/transactions";
import {
  defaultExpiryMs,
  decodeSubscriptionAccount,
  decodeSubscriptionKeyAccount,
  derivePublisherDelegatePda,
  deriveStreamPda,
  deriveSubscriptionKeyPda,
  deriveSubscriptionMint,
  deriveSubscriptionPda,
  deriveSubscriberKeyPda,
  deriveStreamState,
  deriveTierConfigPda,
  deriveWalletKeyPda,
  encodeSubscribeData,
  hasRegisteredSubscriptionKey,
  hasRegisteredWalletKey,
  resolveEvidenceLevel,
  resolvePricingType,
  PRICING_TYPE_MAP,
  EVIDENCE_LEVEL_MAP,
  sha256Bytes,
  type DecodedSubscription,
  type DecodedSubscriptionKey,
  type TierInput,
} from "@sigints/sdk/src/solana";

export {
  defaultExpiryMs,
  encodeSubscribeData,
  deriveSubscriptionPda,
  deriveSubscriptionMint,
  deriveSubscriberKeyPda,
  deriveWalletKeyPda,
  deriveSubscriptionKeyPda,
  hasRegisteredWalletKey,
  hasRegisteredSubscriptionKey,
  deriveTierConfigPda,
  deriveStreamState,
  resolvePricingType,
  resolveEvidenceLevel,
  decodeSubscriptionAccount,
  decodeSubscriptionKeyAccount,
  type DecodedSubscription,
  type DecodedSubscriptionKey,
  deriveStreamPda,
  derivePublisherDelegatePda,
  PRICING_TYPE_MAP,
  EVIDENCE_LEVEL_MAP,
  sha256Bytes,
  type TierInput,
  type BuiltTransaction,
  type UpsertTierInput,
};

function requireProgramId(label: string, value: string): string {
  if (!value) {
    throw new Error(`${label} not configured`);
  }
  return value;
}

export async function buildSubscribeTransaction(params: {
  connection: Connection;
  subscriber: PublicKey;
  stream: string;
  tierId: string;
  pricingType: string;
  evidenceLevel: string;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
  maker: string;
  treasury: string;
}): Promise<BuiltTransaction> {
  return sdkBuildSubscribeTransaction({
    connection: params.connection,
    programId: requireProgramId("Subscription program id", SUBSCRIPTION_PROGRAM_ID),
    streamRegistryProgramId: requireProgramId("Stream registry program id", STREAM_REGISTRY_PROGRAM_ID),
    stream: params.stream,
    subscriber: params.subscriber,
    tierId: params.tierId,
    pricingType: resolvePricingType(params.pricingType),
    evidenceLevel: resolveEvidenceLevel(params.evidenceLevel),
    expiresAtMs: params.expiresAtMs,
    quotaRemaining: params.quotaRemaining,
    priceLamports: params.priceLamports,
    maker: params.maker,
    treasury: params.treasury,
  });
}

export async function buildRegisterSubscriptionKeyTransaction(params: {
  connection: Connection;
  subscriber: PublicKey;
  stream: string;
  encPubKeyBase64: string;
}): Promise<BuiltTransaction> {
  return sdkBuildRegisterSubscriptionKeyTransaction({
    connection: params.connection,
    programId: requireProgramId("Subscription program id", SUBSCRIPTION_PROGRAM_ID),
    stream: params.stream,
    subscriber: params.subscriber,
    encPubKeyBase64: params.encPubKeyBase64,
  });
}

export async function buildRecordSignalTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  streamId?: string;
  streamPubkey?: string;
  metadata: Parameters<typeof sdkBuildRecordSignalTransaction>[0]["metadata"];
}): Promise<BuiltTransaction> {
  return sdkBuildRecordSignalTransaction({
    connection: params.connection,
    programId: requireProgramId("Subscription program id", SUBSCRIPTION_PROGRAM_ID),
    streamRegistryProgramId: requireProgramId("Stream registry program id", STREAM_REGISTRY_PROGRAM_ID),
    authority: params.authority,
    streamId: params.streamId,
    streamPubkey: params.streamPubkey,
    metadata: params.metadata,
  });
}

export async function buildGrantPublisherTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  stream: PublicKey;
  agent: string;
}): Promise<BuiltTransaction> {
  return sdkBuildGrantPublisherTransaction({
    connection: params.connection,
    programId: requireProgramId("Stream registry program id", STREAM_REGISTRY_PROGRAM_ID),
    stream: params.stream,
    authority: params.authority,
    agent: params.agent,
  });
}

export async function buildRevokePublisherTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  stream: PublicKey;
  agent: string;
}): Promise<BuiltTransaction> {
  return sdkBuildRevokePublisherTransaction({
    connection: params.connection,
    programId: requireProgramId("Stream registry program id", STREAM_REGISTRY_PROGRAM_ID),
    stream: params.stream,
    authority: params.authority,
    agent: params.agent,
  });
}

export async function buildCreateStreamTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  streamId: string;
  tiers: TierInput[];
  dao?: string;
  visibility: "public" | "private";
}): Promise<BuiltTransaction & { streamPda: PublicKey; tiersHash: Uint8Array }> {
  return sdkBuildCreateStreamTransaction({
    connection: params.connection,
    programId: requireProgramId("Stream registry program id", STREAM_REGISTRY_PROGRAM_ID),
    authority: params.authority,
    streamId: params.streamId,
    tiers: params.tiers,
    dao: params.dao,
    visibility: params.visibility,
  });
}

export async function buildUpsertTiersTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  stream: PublicKey;
  tiers: UpsertTierInput[];
}): Promise<BuiltTransaction> {
  return sdkBuildUpsertTiersTransaction({
    connection: params.connection,
    programId: requireProgramId("Stream registry program id", STREAM_REGISTRY_PROGRAM_ID),
    authority: params.authority,
    stream: params.stream,
    tiers: params.tiers,
  });
}

export function resolveProgramId(): PublicKey {
  return new PublicKey(SUBSCRIPTION_PROGRAM_ID);
}

export function resolveStreamRegistryId(): PublicKey {
  return new PublicKey(STREAM_REGISTRY_PROGRAM_ID);
}

export function resolveStreamPubkey(input?: string): PublicKey {
  if (!input) {
    throw new Error("Missing stream on-chain address");
  }
  return new PublicKey(input);
}
