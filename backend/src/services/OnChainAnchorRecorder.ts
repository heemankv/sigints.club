import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256Hex } from "../utils/hash";
import { OnChainRecorder, RecordSignalInput } from "./OnChainRecorder";

type AnchorRecorderConfig = {
  rpcUrl: string;
  keypairPath?: string;
  secretKeyBase58?: string;
  programId: string;
  idlPath?: string;
  commitment?: anchor.web3.Commitment;
  streamMap?: Record<string, string>;
  streamDefault?: string;
};

export class OnChainAnchorRecorder implements OnChainRecorder {
  private client?: { provider: anchor.AnchorProvider; coder: anchor.BorshInstructionCoder };
  private readonly programId: PublicKey;

  constructor(private config: AnchorRecorderConfig) {
    this.programId = new PublicKey(config.programId);
  }

  async recordSignal(input: RecordSignalInput): Promise<string | undefined> {
    const { provider, coder } = await this.getClient();
    const walletPubkey = provider.wallet.publicKey;
    const streamPubkey = this.resolveStream(input.streamId, walletPubkey);

    const signalHashBytes = toBytes32(input.signalHash, "signalHash");
    const signalPointerHash = sha256Hex(Buffer.from(input.signalPointer));
    const signalPointerHashBytes = toBytes32(signalPointerHash, "signalPointerHash");
    const zero32 = new Uint8Array(32);
    const keyboxHashBytes = input.keyboxHash ? toBytes32(input.keyboxHash, "keyboxHash") : zero32;
    const keyboxPointerHashBytes = input.keyboxPointer
      ? toBytes32(sha256Hex(Buffer.from(input.keyboxPointer)), "keyboxPointerHash")
      : zero32;

    const [signalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("signal_latest"), streamPubkey.toBuffer()],
      this.programId
    );
    const [streamState] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream_state"), streamPubkey.toBuffer()],
      this.programId
    );

    const data = coder.encode("record_signal", {
      signal_hash: Array.from(signalHashBytes),
      signal_pointer_hash: Array.from(signalPointerHashBytes),
      keybox_hash: Array.from(keyboxHashBytes),
      keybox_pointer_hash: Array.from(keyboxPointerHashBytes),
    });

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: signalPda, isSigner: false, isWritable: true },
        { pubkey: streamPubkey, isSigner: false, isWritable: false },
        { pubkey: streamState, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const signature = await provider.sendAndConfirm(tx);
    // eslint-disable-next-line no-console
    console.log(`[on-chain] record_signal ${signature}`);
    return signature;
  }

  private resolveStream(streamId: string, fallback: PublicKey): PublicKey {
    const mapped = this.config.streamMap?.[streamId] ?? this.config.streamDefault;
    if (mapped) {
      return new PublicKey(mapped);
    }
    return fallback;
  }

  private async getClient(): Promise<{ provider: anchor.AnchorProvider; coder: anchor.BorshInstructionCoder }> {
    if (this.client) {
      return this.client;
    }
    const idlPath = this.resolveIdlPath();
    const idlRaw = await readFile(idlPath, "utf8");
    const idl = JSON.parse(idlRaw) as anchor.Idl;
    const keypair = await this.loadKeypair();
    const connection = new Connection(this.config.rpcUrl, this.config.commitment ?? "confirmed");
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: this.config.commitment ?? "confirmed",
    });
    const coder = new anchor.BorshInstructionCoder(idl);
    this.client = { provider, coder };
    return this.client;
  }

  private resolveIdlPath(): string {
    if (this.config.idlPath) {
      return this.expandPath(this.config.idlPath);
    }
    return path.resolve(process.cwd(), "idl", "subscription_royalty.json");
  }

  private async loadKeypair(): Promise<Keypair> {
    if (this.config.secretKeyBase58) {
      const decoder = (bs58 as unknown as { default?: typeof bs58 }).default ?? bs58;
      const decoded = decoder.decode(this.config.secretKeyBase58);
      return Keypair.fromSecretKey(decoded);
    }
    if (!this.config.keypairPath) {
      throw new Error("SOLANA_KEYPAIR or SOLANA_PRIVATE_KEY must be set for on-chain recording.");
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

function toBytes32(hex: string, label: string): Buffer {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`${label} must be 32 bytes (got ${buf.length})`);
  }
  return buf;
}
