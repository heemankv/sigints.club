"use client";

import {
  BaseWalletAdapter,
  WalletReadyState,
  type WalletName,
  type SendTransactionOptions,
  type TransactionOrVersionedTransaction,
} from "@solana/wallet-adapter-base";
import type { Connection, TransactionSignature, TransactionVersion } from "@solana/web3.js";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { backendUrl } from "./api";
import { testWalletSend, testWalletSignMessage } from "./sdkBackend";

const TEST_WALLET_NAME = "TestWallet" as WalletName<"TestWallet">;
const TEST_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI2IiBmaWxsPSIjMjEyNzJFIi8+PHBhdGggZD0iTTEwIDE2SDE4IiBzdHJva2U9IiM5QkZGRkYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+";

export class TestWalletAdapter extends BaseWalletAdapter<"TestWallet"> {
  name = TEST_WALLET_NAME;
  url = "https://sigints.local/test-wallet";
  icon = TEST_ICON;
  readyState = WalletReadyState.Installed;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> | null = null;
  publicKey: PublicKey | null = null;
  connecting = false;
  private readonly basePublicKey: PublicKey;
  private readonly walletName?: string;

  constructor(publicKeyBase58: string, walletName?: string) {
    super();
    this.basePublicKey = new PublicKey(publicKeyBase58);
    this.walletName = walletName;
    this.publicKey = null;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connecting = true;
    this.publicKey = this.basePublicKey;
    this.emit("connect", this.basePublicKey);
    this.connecting = false;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.publicKey = null;
    this.emit("disconnect");
  }

  async sendTransaction(
    _transaction: TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>,
    _connection: Connection,
    _options?: SendTransactionOptions
  ): Promise<TransactionSignature> {
    if (!this.publicKey) {
      throw new Error("Test wallet not connected");
    }
    const transaction = _transaction as Transaction | VersionedTransaction;
    const connection = _connection;
    const options = _options;
    const isVersioned = "version" in transaction;
    if (!isVersioned) {
      if (!transaction.feePayer) {
        transaction.feePayer = this.publicKey;
      }
      if (!transaction.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
      }
    }
    const serialized = isVersioned
      ? transaction.serialize()
      : transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    const data = await testWalletSend(
      backendUrl(),
      {
        transactionBase64: Buffer.from(serialized).toString("base64"),
        skipPreflight: options?.skipPreflight ?? false,
      },
      this.walletName
    );
    if (!data.signature) {
      throw new Error("Test wallet returned no signature");
    }
    return data.signature;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const data = await testWalletSignMessage(
      backendUrl(),
      { messageBase64: Buffer.from(message).toString("base64") },
      this.walletName
    );
    if (!data.signatureBase64) {
      throw new Error("Test wallet returned no signature");
    }
    return Buffer.from(data.signatureBase64, "base64");
  }
}
