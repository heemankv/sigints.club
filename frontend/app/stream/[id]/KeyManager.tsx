"use client";

import { useState } from "react";
import { subscriberIdFromPubkey, toBase64Bytes, x25519SpkiToRaw } from "../../lib/crypto";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildRegisterWalletKeyInstruction, resolveProgramId } from "../../lib/solana";
import { Transaction } from "@solana/web3.js";
import { syncWalletKey } from "../../lib/sdkBackend";
import { useWalletKeyStatus } from "../../lib/walletKeyStatus";
import { useUserProfile } from "../../lib/userProfile";

type KeyManagerProps = {
  variant?: "card" | "plain";
  className?: string;
};

export default function KeyManager({ variant = "card", className }: KeyManagerProps) {
  const [pubKey, setPubKey] = useState("");
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { refresh: refreshWalletKey, needsWalletKey } = useWalletKeyStatus();
  const { profile, refresh: refreshProfile } = useUserProfile();

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
      await syncWalletKey({
        wallet: publicKey.toBase58(),
      });
      setSyncStatus("Backend sync complete.");
      await refreshWalletKey();
      await refreshProfile();
    } catch (err: any) {
      setChainStatus(err?.message ?? "Failed to register on-chain key.");
    }
  }

  const isPlain = variant === "plain";
  const containerClass = [
    isPlain ? "key-manager key-manager--plain" : "card key-manager",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const registeredAt = profile?.walletKeyRegisteredAt;
  const registeredAtLabel = registeredAt
    ? new Date(registeredAt).toLocaleString()
    : null;
  const registeredKey = profile?.walletKeyPublicKey;
  const showUpdateView = !needsWalletKey;

  return (
    <div className={containerClass}>
      {!isPlain && <div className="hud-corners" />}
      <h3 className="key-manager-title">
        Encryption Key Registration
        {needsWalletKey && <span className="status-dot" aria-label="Wallet key missing" />}
      </h3>

      {showUpdateView ? (
        <>
          <div className="key-status-card">
            <p className="key-status-title">Wallet key registered</p>
            <p className="subtext">
              {registeredAtLabel
                ? `Registered on ${registeredAtLabel}.`
                : "An on-chain wallet key is already registered."}
            </p>
            {registeredKey && (
              <div className="key-status-meta">
                <span className="subtext">Current public key (base64 DER)</span>
                <code>{registeredKey.slice(0, 20)}…{registeredKey.slice(-12)}</code>
              </div>
            )}
          </div>

          <div className="divider" />
          <h4 style={{ marginBottom: 8 }}>Update key</h4>
          <p className="subtext" style={{ marginBottom: 12 }}>
            To rotate your encryption key, generate a new X25519 keypair locally and register the new public key
            on-chain. Keep the private key offline — you will only use it when decrypting.
          </p>
        </>
      ) : (
        <>
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
        </>
      )}

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
        {showUpdateView ? "Register New Key On-chain" : "Register Key On-chain"}
      </button>
      {!publicKey && <p className="subtext">Connect wallet to register your key.</p>}
      {chainStatus && <p className="subtext">{chainStatus}</p>}
      {syncStatus && <p className="subtext">{syncStatus}</p>}
    </div>
  );
}
