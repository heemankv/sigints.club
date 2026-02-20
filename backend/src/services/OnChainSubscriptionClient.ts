import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256Hex } from "../utils/hash";

export type SubscriptionRequest = {
  personaId: string;
  tierId: string;
  pricingType: string | number;
  evidenceLevel: string | number;
  expiresAt?: number;
  quotaRemaining?: number;
  priceLamports?: number;
  subscriberPubkey?: string;
  makerPubkey?: string;
  treasuryPubkey?: string;
};

export type RenewalRequest = {
  personaId: string;
  expiresAt?: number;
  quotaRemaining?: number;
  subscriberPubkey?: string;
};

export type CancelRequest = {
  personaId: string;
  subscriberPubkey?: string;
};

export type OnChainSubscription = {
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

type AnchorSubscriptionConfig = {
  rpcUrl: string;
  keypairPath?: string;
  secretKeyBase58?: string;
  programId: string;
  commitment?: anchor.web3.Commitment;
  personaMap?: Record<string, string>;
  personaDefault?: string;
};

const PRICING_TYPE_MAP: Record<string, number> = {
  subscription_limited: 0,
  subscription_unlimited: 1,
  per_signal: 2,
};

const EVIDENCE_LEVEL_MAP: Record<string, number> = {
  trust: 0,
  verifier: 1,
};

const SUBSCRIBE_DISCRIMINATOR = new Uint8Array([254, 28, 191, 138, 156, 179, 183, 53]);

export class OnChainSubscriptionClient {
  private client?: { provider: anchor.AnchorProvider; coder: anchor.BorshInstructionCoder; idl: anchor.Idl };
  private readonly programId: PublicKey;

  constructor(private config: AnchorSubscriptionConfig) {
    this.programId = new PublicKey(config.programId);
  }

  async subscribe(input: SubscriptionRequest): Promise<string> {
    const { provider, coder } = await this.getClient();
    const walletPubkey = provider.wallet.publicKey;
    const subscriberPubkey = this.resolveSubscriber(input.subscriberPubkey, walletPubkey);
    const personaPubkey = this.resolvePersona(input.personaId, walletPubkey);
    if (!input.makerPubkey || !input.treasuryPubkey) {
      throw new Error("makerPubkey and treasuryPubkey are required for subscribe");
    }
    const makerPubkey = new PublicKey(input.makerPubkey);
    const treasuryPubkey = new PublicKey(input.treasuryPubkey);

    const tierHashBytes = toBytes32(sha256Hex(Buffer.from(input.tierId)), "tierIdHash");
    const pricingType = normalizeEnum(input.pricingType, PRICING_TYPE_MAP, "pricingType");
    const evidenceLevel = normalizeEnum(input.evidenceLevel, EVIDENCE_LEVEL_MAP, "evidenceLevel");
    const expiresAt = new BN(input.expiresAt ?? defaultExpiry());
    const quotaRemaining = input.quotaRemaining ?? 0;
    const priceLamports = input.priceLamports ?? 0;

    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription"), personaPubkey.toBuffer(), subscriberPubkey.toBuffer()],
      this.programId
    );

    const data = encodeSubscribeData({
      tierHash: tierHashBytes,
      pricingType,
      evidenceLevel,
      expiresAt: expiresAt.toNumber(),
      quotaRemaining,
      priceLamports,
    });

    const [subscriptionMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription_mint"), personaPubkey.toBuffer(), subscriberPubkey.toBuffer()],
      this.programId
    );
    const [personaState] = PublicKey.findProgramAddressSync(
      [Buffer.from("persona_state"), personaPubkey.toBuffer()],
      this.programId
    );

    const subscriberAta = getAssociatedTokenAddressSync(subscriptionMint, subscriberPubkey);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: subscriptionPda, isSigner: false, isWritable: true },
        { pubkey: subscriptionMint, isSigner: false, isWritable: true },
        { pubkey: personaState, isSigner: false, isWritable: true },
        { pubkey: subscriberAta, isSigner: false, isWritable: true },
        { pubkey: personaPubkey, isSigner: false, isWritable: false },
        { pubkey: subscriberPubkey, isSigner: true, isWritable: true },
        { pubkey: makerPubkey, isSigner: false, isWritable: true },
        { pubkey: treasuryPubkey, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const signature = await provider.sendAndConfirm(tx);
    return signature;
  }

  async renew(input: RenewalRequest): Promise<string> {
    const { provider, coder } = await this.getClient();
    const walletPubkey = provider.wallet.publicKey;
    const subscriberPubkey = this.resolveSubscriber(input.subscriberPubkey, walletPubkey);
    const personaPubkey = this.resolvePersona(input.personaId, walletPubkey);

    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription"), personaPubkey.toBuffer(), subscriberPubkey.toBuffer()],
      this.programId
    );
    const [personaState] = PublicKey.findProgramAddressSync(
      [Buffer.from("persona_state"), personaPubkey.toBuffer()],
      this.programId
    );

    const data = coder.encode("renew", {
      expires_at: new BN(input.expiresAt ?? defaultExpiry()),
      quota_remaining: input.quotaRemaining ?? 0,
    });

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: subscriptionPda, isSigner: false, isWritable: true },
        { pubkey: personaState, isSigner: false, isWritable: true },
        { pubkey: subscriberPubkey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    return provider.sendAndConfirm(tx);
  }

  async cancel(input: CancelRequest): Promise<string> {
    const { provider, coder } = await this.getClient();
    const walletPubkey = provider.wallet.publicKey;
    const subscriberPubkey = this.resolveSubscriber(input.subscriberPubkey, walletPubkey);
    const personaPubkey = this.resolvePersona(input.personaId, walletPubkey);

    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription"), personaPubkey.toBuffer(), subscriberPubkey.toBuffer()],
      this.programId
    );
    const [personaState] = PublicKey.findProgramAddressSync(
      [Buffer.from("persona_state"), personaPubkey.toBuffer()],
      this.programId
    );

    const data = coder.encode("cancel", {});

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: subscriptionPda, isSigner: false, isWritable: true },
        { pubkey: personaState, isSigner: false, isWritable: true },
        { pubkey: subscriberPubkey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    return provider.sendAndConfirm(tx);
  }

  async listSubscriptionsFor(subscriber: string): Promise<OnChainSubscription[]> {
    const { provider } = await this.getClient();
    const subscriberPubkey = new PublicKey(subscriber);
    const filters = [
      { memcmp: { offset: 8, bytes: subscriberPubkey.toBase58() } },
    ];

    const programAccounts = await provider.connection.getProgramAccounts(this.programId, {
      filters,
    });

    return programAccounts
      .map((acc) => {
        try {
          const decoded = decodeSubscriptionAccount(acc.pubkey, acc.account.data);
          return decoded;
        } catch {
          return null;
        }
      })
      .filter((item): item is OnChainSubscription => item !== null);
  }

  private resolvePersona(personaId: string, fallback: PublicKey): PublicKey {
    const mapped = this.config.personaMap?.[personaId] ?? this.config.personaDefault;
    if (mapped) {
      return new PublicKey(mapped);
    }
    return fallback;
  }

  private resolveSubscriber(subscriber?: string, fallback?: PublicKey): PublicKey {
    if (subscriber) {
      const pubkey = new PublicKey(subscriber);
      if (fallback && !pubkey.equals(fallback)) {
        throw new Error("subscriberPubkey must match backend wallet in MVP");
      }
      return pubkey;
    }
    if (!fallback) {
      throw new Error("Missing subscriber pubkey");
    }
    return fallback;
  }

  private async getClient(): Promise<{
    provider: anchor.AnchorProvider;
    coder: anchor.BorshInstructionCoder;
    idl: anchor.Idl;
  }> {
    if (this.client) {
      return this.client;
    }
    const idlPath = path.resolve(process.cwd(), "idl", "subscription_royalty.json");
    const idlRaw = await readFile(idlPath, "utf8");
    const idl = JSON.parse(idlRaw) as anchor.Idl;
    const keypair = await this.loadKeypair();
    const connection = new Connection(this.config.rpcUrl, this.config.commitment ?? "confirmed");
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: this.config.commitment ?? "confirmed",
    });
    const coder = new anchor.BorshInstructionCoder(idl);
    this.client = { provider, coder, idl };
    return this.client;
  }

  private async loadKeypair(): Promise<Keypair> {
    if (this.config.secretKeyBase58) {
      const decoder = (bs58 as unknown as { default?: typeof bs58 }).default ?? bs58;
      const decoded = decoder.decode(this.config.secretKeyBase58);
      return Keypair.fromSecretKey(decoded);
    }
    if (!this.config.keypairPath) {
      throw new Error("SOLANA_KEYPAIR or SOLANA_PRIVATE_KEY must be set for on-chain subscriptions.");
    }
    const keypairRaw = await readFile(this.expandPath(this.config.keypairPath), "utf8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairRaw)));
  }

  private expandPath(input: string): string {
    if (input.startsWith("~/")) {
      return path.join(os.homedir(), input.slice(2));
    }
    return input;
  }
}

function normalizeEnum(value: string | number, map: Record<string, number>, label: string): number {
  if (typeof value === "number") {
    return value;
  }
  const mapped = map[value];
  if (mapped === undefined) {
    throw new Error(`Unknown ${label}: ${value}`);
  }
  return mapped;
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

function encodeSubscribeData(params: {
  tierHash: Buffer;
  pricingType: number;
  evidenceLevel: number;
  expiresAt: number;
  quotaRemaining: number;
  priceLamports: number;
}): Buffer {
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 8);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.set(params.tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.expiresAt), 42);
  writeUint32LE(data, params.quotaRemaining, 50);
  writeBigInt64LE(data, BigInt(params.priceLamports), 54);
  return Buffer.from(data);
}

function toBytes32(hex: string, label: string): Buffer {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`${label} must be 32 bytes (got ${buf.length})`);
  }
  return buf;
}

function defaultExpiry(): number {
  const days = 30;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function decodeSubscriptionAccount(pubkey: PublicKey, data: Buffer): OnChainSubscription | null {
  if (data.length < 152) {
    return null;
  }
  let offset = 8;
  const subscriber = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const persona = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const tierId = data.subarray(offset, offset + 32);
  offset += 32;
  const pricingType = data.readUInt8(offset);
  offset += 1;
  const evidenceLevel = data.readUInt8(offset);
  offset += 1;
  const expiresAt = Number(data.readBigInt64LE(offset));
  offset += 8;
  const quotaRemaining = data.readUInt32LE(offset);
  offset += 4;
  const status = data.readUInt8(offset);
  offset += 1;
  const nftMint = new PublicKey(data.subarray(offset, offset + 32));

  return {
    subscription: pubkey.toBase58(),
    subscriber: subscriber.toBase58(),
    persona: persona.toBase58(),
    tierIdHex: tierId.toString("hex"),
    pricingType,
    evidenceLevel,
    expiresAt,
    quotaRemaining,
    status,
    nftMint: nftMint.toBase58(),
  };
}
