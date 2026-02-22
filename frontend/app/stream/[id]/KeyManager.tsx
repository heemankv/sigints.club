"use client";

import { useEffect, useState } from "react";
import { generateX25519Keypair, subscriberIdFromPubkey, toBase64Bytes, x25519SpkiToRaw } from "../../lib/crypto";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildRegisterWalletKeyInstruction, resolveProgramId } from "../../lib/solana";
import { Transaction } from "@solana/web3.js";

const storageKey = (wallet?: string) => `wallet.keys.${wallet ?? "unknown"}`;

export default function KeyManager() {
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    if (!publicKey) return;
    const raw = localStorage.getItem(storageKey(publicKey.toBase58()));
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setPubKey(data.publicKeyBase64 ?? "");
      setPrivKey(data.privateKeyBase64 ?? "");
      setSubscriberId(data.subscriberId ?? null);
    } catch {
      // ignore
    }
  }, [publicKey]);

  async function generate() {
    setStatus(null);
    try {
      const data = await generateX25519Keypair();
      const subId = await subscriberIdFromPubkey(data.publicKeyBase64);
      setPubKey(data.publicKeyBase64);
      setPrivKey(data.privateKeyBase64);
      setSubscriberId(subId);
      const key = storageKey(publicKey?.toBase58());
      localStorage.setItem(key, JSON.stringify({ ...data, subscriberId: subId }));
      setStatus("Generated new keypair. Store your private key safely.");
    } catch (err: any) {
      setStatus(err?.message ?? "Failed to generate keypair in this browser.");
    }
  }

  async function registerOnchain() {
    setChainStatus(null);
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
    } catch (err: any) {
      setChainStatus(err?.message ?? "Failed to register on-chain key.");
    }
  }

  return (
    <div className="card">
      <div className="hud-corners" />
      <h3>Wallet Key Manager</h3>
      <p>Register one encryption keypair for all subscriptions.</p>
      <button className="button primary" onClick={generate}>Generate Keypair</button>
      {status && <p className="subtext">{status}</p>}
      <div className="field">
        <label>Public Key (base64)</label>
        <textarea value={pubKey} onChange={(e) => setPubKey(e.target.value)} />
      </div>
      <div className="field">
        <label>Private Key (base64)</label>
        <textarea value={privKey} onChange={(e) => setPrivKey(e.target.value)} />
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
    </div>
  );
}
