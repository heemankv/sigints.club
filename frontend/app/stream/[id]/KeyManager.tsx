"use client";

import { useState } from "react";
import { subscriberIdFromPubkey, toBase64Bytes, x25519SpkiToRaw } from "../../lib/crypto";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildRegisterWalletKeyInstruction, resolveProgramId } from "../../lib/solana";
import { Transaction } from "@solana/web3.js";
import { syncWalletKey } from "../../lib/sdkBackend";

export default function KeyManager() {
  const [pubKey, setPubKey] = useState("");
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  async function handlePubKeyChange(next: string) {
    setPubKey(next);
    setStatus(null);
    if (!next) {
      setSubscriberId(null);
      return;
    }
    try {
      const subId = await subscriberIdFromPubkey(next);
      setSubscriberId(subId);
    } catch (err: any) {
      setSubscriberId(null);
      setStatus(err?.message ?? "Invalid public key format.");
    }
  }

  async function registerOnchain() {
    setChainStatus(null);
    setSyncStatus(null);
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (!pubKey) {
        throw new Error("Generate or paste a public key first.");
      }
      const rawPub = x25519SpkiToRaw(pubKey);
      const programId = resolveProgramId();
      const ix = buildRegisterWalletKeyInstruction({
        programId,
        subscriber: publicKey,
        encPubKeyBase64: toBase64Bytes(rawPub),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      setChainStatus(`Registered on-chain key: ${signature.slice(0, 10)}…`);
      await syncWalletKey(process.env.NEXT_PUBLIC_BACKEND_URL ?? "", {
        wallet: publicKey.toBase58(),
      });
      setSyncStatus("Backend sync complete.");
    } catch (err: any) {
      setChainStatus(err?.message ?? "Failed to register on-chain key.");
    }
  }

  return (
    <div className="card">
      <div className="hud-corners" />
      <h3>Wallet Key Manager</h3>
      <p>
        Generate an X25519 keypair locally on your machine, then paste the <strong>public key</strong> here to
        register it on-chain. Keep the private key offline — you will only use it when decrypting.
      </p>

      <div className="key-instructions">
        <div className="key-block">
          <h4>macOS / Linux</h4>
          <pre>
{`openssl genpkey -algorithm X25519 -out x25519.key
openssl pkey -in x25519.key -pubout -outform DER | openssl base64 -A`}
          </pre>
          <p className="subtext">Copy the output above as your public key (base64 DER).</p>
        </div>
        <div className="key-block">
          <h4>Windows (PowerShell / Git Bash)</h4>
          <pre>
{`openssl genpkey -algorithm X25519 -out x25519.key
openssl pkey -in x25519.key -pubout -outform DER | openssl base64 -A`}
          </pre>
          <p className="subtext">
            If `openssl` is missing, install OpenSSL or use Git Bash.
          </p>
        </div>
      </div>

      {status && <p className="subtext">{status}</p>}
      <div className="field">
        <label>Public Key (base64 DER)</label>
        <textarea value={pubKey} onChange={(e) => void handlePubKeyChange(e.target.value.trim())} />
      </div>
      {subscriberId && <p className="subtext">Subscriber ID: {subscriberId}</p>}
      <div className="divider" />
      <button
        className="button ghost"
        onClick={registerOnchain}
        disabled={!publicKey}
      >
        Register Key On-chain
      </button>
      {!publicKey && <p className="subtext">Connect wallet to register your key.</p>}
      {chainStatus && <p className="subtext">{chainStatus}</p>}
      {syncStatus && <p className="subtext">{syncStatus}</p>}
    </div>
  );
}
