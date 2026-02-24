"use client";

import { useEffect, useState } from "react";
import { subscriberIdFromPubkey, toBase64Bytes, x25519SpkiToRaw } from "../../lib/crypto";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildRegisterSubscriptionKeyInstruction,
  hasRegisteredSubscriptionKey,
  resolveProgramId,
  resolveStreamPubkey,
} from "../../lib/solana";
import { Transaction } from "@solana/web3.js";
import { syncWalletKey } from "../../lib/sdkBackend";

type KeyManagerProps = {
  streamId: string;
  streamOnchainAddress?: string;
  variant?: "card" | "plain";
  className?: string;
};

export default function KeyManager({ streamId, streamOnchainAddress, variant = "card", className }: KeyManagerProps) {
  const [pubKey, setPubKey] = useState("");
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formClosing, setFormClosing] = useState(false);
  const [keyRegistered, setKeyRegistered] = useState<boolean | null>(null);
  const [registeredKey, setRegisteredKey] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    let active = true;
    async function checkKeyStatus() {
      if (!publicKey) {
        setKeyRegistered(null);
        return;
      }
      if (!streamOnchainAddress) {
        setKeyRegistered(false);
        return;
      }
      try {
        const programId = resolveProgramId();
        const streamPubkey = resolveStreamPubkey(streamOnchainAddress);
        const registered = await hasRegisteredSubscriptionKey(connection, programId, streamPubkey, publicKey);
        if (!active) return;
        setKeyRegistered(registered);
      } catch {
        if (!active) return;
        setKeyRegistered(false);
      }
    }
    void checkKeyStatus();
    return () => {
      active = false;
    };
  }, [publicKey, connection, streamOnchainAddress]);

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
      if (!streamOnchainAddress) {
        throw new Error("Stream is missing an on-chain address.");
      }
      if (!pubKey) {
        throw new Error("Generate or paste a public key first.");
      }
      if (!streamId) {
        throw new Error("Missing stream id for key registration.");
      }
      const rawPub = x25519SpkiToRaw(pubKey);
      const programId = resolveProgramId();
      const streamPubkey = resolveStreamPubkey(streamOnchainAddress);
      const ix = buildRegisterSubscriptionKeyInstruction({
        programId,
        stream: streamPubkey,
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
        streamId,
      });
      setSyncStatus("Backend sync complete.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("subscriptionKeyUpdated", { detail: { streamId } }));
      }
      setKeyRegistered(true);
      setRegisteredKey(pubKey);
      setShowForm(false);
      setPubKey("");
      setSubscriberId(null);
    } catch (err: any) {
      setChainStatus(err?.message ?? "Failed to register on-chain key.");
    }
  }

  function dismissForm() {
    setFormClosing(true);
  }

  function onFormExited() {
    setFormClosing(false);
    setShowForm(false);
    setPubKey("");
    setSubscriberId(null);
    setStatus(null);
    setChainStatus(null);
    setSyncStatus(null);
  }

  const isPlain = variant === "plain";
  const containerClass = [
    isPlain ? "key-manager key-manager--plain" : "card key-manager",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hasKey = keyRegistered === true;

  return (
    <div className={containerClass}>
      {!isPlain && <div className="hud-corners" />}
      <h3 className="key-manager-title">
        Stream Encryption Key
        {keyRegistered === false && <span className="status-dot" aria-label="Encryption key missing" />}
      </h3>
      <p className="subtext">
        Register one X25519 public key per stream. This key is used to encrypt the symmetric key for your subscription.
      </p>

      {/* Key exists, form hidden — GitHub-style key card */}
      {hasKey && !showForm && (
        <div className="key-registered-card">
          <div className="key-registered-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          <div className="key-registered-details">
            {registeredKey && (
              <code className="key-registered-pubkey">
                {registeredKey.slice(0, 16)}…{registeredKey.slice(-12)}
              </code>
            )}
            <span className="subtext">Registered for this stream.</span>
          </div>
          <button
            className="button ghost"
            onClick={() => setShowForm(true)}
          >
            Update Key
          </button>
        </div>
      )}

      {/* No key exists, form hidden — empty state */}
      {!hasKey && !showForm && (
        <div className="key-empty-state">
          <p className="subtext">No encryption key registered.</p>
          <button
            className="button ghost"
            onClick={() => setShowForm(true)}
          >
            Register New Key
          </button>
        </div>
      )}

      {/* Form visible — registration/update form */}
      {showForm && (
        <div
          className={formClosing ? "key-form-dismiss" : "key-form-reveal"}
          onAnimationEnd={formClosing ? onFormExited : undefined}
        >
          <h4 style={{ marginTop: 12, marginBottom: 8 }}>
            {hasKey ? "Update Encryption Key" : "Register New Key"}
          </h4>
          <p className="subtext" style={{ marginBottom: 12 }}>
            {hasKey
              ? "To rotate your encryption key, generate a new X25519 keypair locally and register the new public key on-chain. Keep the private key offline — you will only use it when decrypting."
              : "Generate an X25519 keypair locally on your machine, then paste the public key here to register it on-chain. Keep the private key offline — you will only use it when decrypting."}
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
          <div className="key-form-actions">
            <button
              className="button ghost"
              onClick={registerOnchain}
              disabled={!publicKey || !streamOnchainAddress}
            >
              {hasKey ? "Update Key On-chain" : "Register Key On-chain"}
            </button>
            <button
              className="button secondary"
              onClick={dismissForm}
            >
              Cancel
            </button>
          </div>
          {!publicKey && <p className="subtext">Connect wallet to register your key.</p>}
          {!streamOnchainAddress && (
            <p className="subtext">On-chain stream address missing. Key registration is disabled.</p>
          )}
          {chainStatus && <p className="subtext">{chainStatus}</p>}
          {syncStatus && <p className="subtext">{syncStatus}</p>}
        </div>
      )}
    </div>
  );
}
