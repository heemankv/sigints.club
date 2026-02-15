"use client";

import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Buffer } from "buffer";

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

export function resolveProgramId(): PublicKey {
  const programId = process.env.NEXT_PUBLIC_SUBSCRIPTION_PROGRAM_ID ?? "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE";
  return new PublicKey(programId);
}

export function resolvePersonaPubkey(input?: string): PublicKey {
  if (!input) {
    throw new Error("Missing persona on-chain address");
  }
  return new PublicKey(input);
}

export function resolvePricingType(value: string): number {
  const mapped = PRICING_TYPE_MAP[value];
  if (mapped === undefined) {
    throw new Error(`Unknown pricing type: ${value}`);
  }
  return mapped;
}

export function resolveEvidenceLevel(value: string): number {
  const mapped = EVIDENCE_LEVEL_MAP[value];
  if (mapped === undefined) {
    throw new Error(`Unknown evidence level: ${value}`);
  }
  return mapped;
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const hash = await crypto.subtle.digest("SHA-256", buffer as ArrayBuffer);
  return new Uint8Array(hash);
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

export function defaultExpiryMs(): number {
  const days = 30;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

export async function encodeSubscribeData(params: {
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
}): Promise<Uint8Array> {
  const tierHash = await sha256Bytes(params.tierId);
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.expiresAtMs), 42);
  writeUint32LE(data, params.quotaRemaining, 50);
  return data;
}

export function deriveSubscriptionPda(programId: PublicKey, persona: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), persona.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

export function deriveSubscriptionMint(programId: PublicKey, persona: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription_mint"), persona.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

export function buildSubscribeInstruction(params: {
  programId: PublicKey;
  persona: PublicKey;
  subscriber: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
}): Promise<TransactionInstruction> {
  return encodeSubscribeData(params).then((data) => {
    const subscription = deriveSubscriptionPda(params.programId, params.persona, params.subscriber);
    const subscriptionMint = deriveSubscriptionMint(params.programId, params.persona, params.subscriber);
    const subscriberAta = getAssociatedTokenAddressSync(subscriptionMint, params.subscriber);
    return new TransactionInstruction({
      programId: params.programId,
      keys: [
        { pubkey: subscription, isSigner: false, isWritable: true },
        { pubkey: subscriptionMint, isSigner: false, isWritable: true },
        { pubkey: subscriberAta, isSigner: false, isWritable: true },
        { pubkey: params.persona, isSigner: false, isWritable: false },
        { pubkey: params.subscriber, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type DecodedSubscription = {
  subscription: string;
  subscriber: string;
  persona: string;
  tierIdHex: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAt: number;
  quotaRemaining: number;
  status: number;
  nftMint: string;
};

export function decodeSubscriptionAccount(pubkey: PublicKey, data: Buffer): DecodedSubscription | null {
  if (data.length < 152) {
    return null;
  }
  let offset = 8;
  const subscriber = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const persona = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tierId = data.slice(offset, offset + 32);
  offset += 32;
  const pricingType = data[offset];
  offset += 1;
  const evidenceLevel = data[offset];
  offset += 1;
  const expiresAt = Number(data.readBigInt64LE(offset));
  offset += 8;
  const quotaRemaining = data.readUInt32LE(offset);
  offset += 4;
  const status = data[offset];
  offset += 1;
  const nftMint = new PublicKey(data.slice(offset, offset + 32));
  return {
    subscription: pubkey.toBase58(),
    subscriber: subscriber.toBase58(),
    persona: persona.toBase58(),
    tierIdHex: toHex(tierId),
    pricingType,
    evidenceLevel,
    expiresAt,
    quotaRemaining,
    status,
    nftMint: nftMint.toBase58(),
  };
}
