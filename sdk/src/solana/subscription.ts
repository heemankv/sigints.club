import { Connection, type Commitment, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import { EVIDENCE_LEVEL_MAP, PRICING_TYPE_MAP } from "./constants";
import { sha256Bytes, toHex, writeBigInt64LE, writeUint32LE } from "./shared";

const SUBSCRIBE_DISCRIMINATOR = new Uint8Array([254, 28, 191, 138, 156, 179, 183, 53]);
const REGISTER_KEY_DISCRIMINATOR = new Uint8Array([56, 8, 67, 97, 128, 122, 80, 213]);
const REGISTER_WALLET_KEY_DISCRIMINATOR = new Uint8Array([245, 147, 210, 179, 245, 73, 184, 9]);
const REGISTER_SUBSCRIPTION_KEY_DISCRIMINATOR = new Uint8Array([63, 198, 90, 133, 166, 115, 25, 198]);

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
  priceLamports: number;
}): Promise<Uint8Array> {
  const tierHash = await sha256Bytes(params.tierId);
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 8);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.expiresAtMs), 42);
  writeUint32LE(data, params.quotaRemaining, 50);
  writeBigInt64LE(data, BigInt(params.priceLamports), 54);
  return data;
}

export function deriveSubscriptionPda(programId: PublicKey, stream: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), stream.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

export function deriveSubscriptionMint(programId: PublicKey, stream: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription_mint"), stream.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

export function deriveSubscriberKeyPda(programId: PublicKey, subscription: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscriber_key"), subscription.toBuffer()],
    programId
  );
  return pda;
}

export function deriveWalletKeyPda(programId: PublicKey, subscriber: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("wallet_key"), subscriber.toBuffer()],
    programId
  );
  return pda;
}

export function deriveSubscriptionKeyPda(
  programId: PublicKey,
  stream: PublicKey,
  subscriber: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sub_key"), stream.toBuffer(), subscriber.toBuffer()],
    programId
  );
  return pda;
}

export async function hasRegisteredWalletKey(
  connection: Connection,
  programId: PublicKey,
  subscriber: PublicKey,
  commitment: Commitment = "confirmed"
): Promise<boolean> {
  const walletKey = deriveWalletKeyPda(programId, subscriber);
  const account = await connection.getAccountInfo(walletKey, commitment);
  return !!account;
}

export async function hasRegisteredSubscriptionKey(
  connection: Connection,
  programId: PublicKey,
  stream: PublicKey,
  subscriber: PublicKey,
  commitment: Commitment = "confirmed"
): Promise<boolean> {
  const subscriptionKey = deriveSubscriptionKeyPda(programId, stream, subscriber);
  const account = await connection.getAccountInfo(subscriptionKey, commitment);
  return !!account;
}

export function deriveTierConfigPda(
  streamRegistryProgramId: PublicKey,
  stream: PublicKey,
  tierHash: Uint8Array
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), stream.toBuffer(), Buffer.from(tierHash)],
    streamRegistryProgramId
  );
  return pda;
}

export function deriveStreamState(programId: PublicKey, stream: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_state"), stream.toBuffer()],
    programId
  );
  return pda;
}

export function buildSubscribeInstruction(params: {
  programId: PublicKey;
  streamRegistryProgramId: PublicKey;
  stream: PublicKey;
  subscriber: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
  maker: PublicKey;
  treasury: PublicKey;
}): Promise<TransactionInstruction> {
  return encodeSubscribeData(params).then(async (data) => {
    const subscription = deriveSubscriptionPda(params.programId, params.stream, params.subscriber);
    const subscriptionMint = deriveSubscriptionMint(params.programId, params.stream, params.subscriber);
    const streamState = deriveStreamState(params.programId, params.stream);
    const subscriberAta = getAssociatedTokenAddressSync(
      subscriptionMint,
      params.subscriber,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const subscriptionKey = deriveSubscriptionKeyPda(params.programId, params.stream, params.subscriber);
    const tierHash = await sha256Bytes(params.tierId);
    const tierConfig = deriveTierConfigPda(params.streamRegistryProgramId, params.stream, tierHash);
    return new TransactionInstruction({
      programId: params.programId,
      keys: [
        { pubkey: subscription, isSigner: false, isWritable: true },
        { pubkey: subscriptionMint, isSigner: false, isWritable: true },
        { pubkey: streamState, isSigner: false, isWritable: true },
        { pubkey: subscriberAta, isSigner: false, isWritable: true },
        { pubkey: params.stream, isSigner: false, isWritable: false },
        { pubkey: tierConfig, isSigner: false, isWritable: false },
        { pubkey: params.streamRegistryProgramId, isSigner: false, isWritable: false },
        { pubkey: params.subscriber, isSigner: true, isWritable: true },
        { pubkey: params.maker, isSigner: false, isWritable: true },
        { pubkey: params.treasury, isSigner: false, isWritable: true },
        { pubkey: subscriptionKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
  });
}

export function buildRegisterKeyInstruction(params: {
  programId: PublicKey;
  stream: PublicKey;
  subscriber: PublicKey;
  encPubKeyBase64: string;
}): TransactionInstruction {
  const subscription = deriveSubscriptionPda(params.programId, params.stream, params.subscriber);
  const subscriberKey = deriveSubscriberKeyPda(params.programId, subscription);
  const keyBytes = Buffer.from(params.encPubKeyBase64, "base64");
  if (keyBytes.length !== 32) {
    throw new Error("Encryption public key must be 32 bytes (base64)");
  }
  const data = new Uint8Array(8 + 32);
  data.set(REGISTER_KEY_DISCRIMINATOR, 0);
  data.set(keyBytes, 8);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: subscription, isSigner: false, isWritable: false },
      { pubkey: subscriberKey, isSigner: false, isWritable: true },
      { pubkey: params.subscriber, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function buildRegisterWalletKeyInstruction(params: {
  programId: PublicKey;
  subscriber: PublicKey;
  encPubKeyBase64: string;
}): TransactionInstruction {
  const walletKey = deriveWalletKeyPda(params.programId, params.subscriber);
  const keyBytes = Buffer.from(params.encPubKeyBase64, "base64");
  if (keyBytes.length !== 32) {
    throw new Error("Encryption public key must be 32 bytes (base64)");
  }
  const data = new Uint8Array(8 + 32);
  data.set(REGISTER_WALLET_KEY_DISCRIMINATOR, 0);
  data.set(keyBytes, 8);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: walletKey, isSigner: false, isWritable: true },
      { pubkey: params.subscriber, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function buildRegisterSubscriptionKeyInstruction(params: {
  programId: PublicKey;
  stream: PublicKey;
  subscriber: PublicKey;
  encPubKeyBase64: string;
}): TransactionInstruction {
  const subscriptionKey = deriveSubscriptionKeyPda(params.programId, params.stream, params.subscriber);
  const keyBytes = Buffer.from(params.encPubKeyBase64, "base64");
  if (keyBytes.length !== 32) {
    throw new Error("Encryption public key must be 32 bytes (base64)");
  }
  const data = new Uint8Array(8 + 32);
  data.set(REGISTER_SUBSCRIPTION_KEY_DISCRIMINATOR, 0);
  data.set(keyBytes, 8);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.stream, isSigner: false, isWritable: false },
      { pubkey: subscriptionKey, isSigner: false, isWritable: true },
      { pubkey: params.subscriber, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export type DecodedSubscription = {
  subscription: string;
  subscriber: string;
  stream: string;
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
  const stream = new PublicKey(data.slice(offset, offset + 32));
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
    stream: stream.toBase58(),
    tierIdHex: toHex(tierId),
    pricingType,
    evidenceLevel,
    expiresAt,
    quotaRemaining,
    status,
    nftMint: nftMint.toBase58(),
  };
}
