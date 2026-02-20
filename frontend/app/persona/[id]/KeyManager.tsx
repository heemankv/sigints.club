"use client";

import { useEffect, useState } from "react";
import { generateX25519Keypair, subscriberIdFromPubkey } from "../../lib/crypto";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildRegisterKeyInstruction, resolvePersonaPubkey, resolveProgramId } from "../../lib/solana";
import { Transaction } from "@solana/web3.js";

const storageKey = (personaId: string) => `persona.keys.${personaId}`;

export default function KeyManager({
  personaId,
  personaOnchainAddress,
}: {
  personaId: string;
  personaOnchainAddress?: string;
}) {
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(personaId));
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setPubKey(data.publicKeyBase64 ?? "");
      setPrivKey(data.privateKeyBase64 ?? "");
      setSubscriberId(data.subscriberId ?? null);
    } catch {
      // ignore
    }
  }, [personaId]);

  async function generate() {
    setStatus(null);
    try {
      const data = await generateX25519Keypair();
      const subId = await subscriberIdFromPubkey(data.publicKeyBase64);
      setPubKey(data.publicKeyBase64);
      setPrivKey(data.privateKeyBase64);
      setSubscriberId(subId);
      localStorage.setItem(storageKey(personaId), JSON.stringify({ ...data, subscriberId: subId }));
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
      if (!personaOnchainAddress) {
        throw new Error("On-chain persona address missing.");
      }
      if (!pubKey) {
        throw new Error("Generate or paste a public key first.");
      }
      const programId = resolveProgramId();
      const persona = resolvePersonaPubkey(personaOnchainAddress);
      const ix = buildRegisterKeyInstruction({
        programId,
        persona,
        subscriber: publicKey,
        encPubKeyBase64: pubKey,
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
      <h3>Key Manager</h3>
      <p>Generate an encryption keypair for this Persona.</p>
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
        disabled={!personaOnchainAddress || !publicKey}
      >
        Register Key On-chain
      </button>
      {(!personaOnchainAddress || !publicKey) && (
        <p className="subtext">Connect wallet and ensure persona is on-chain.</p>
      )}
      {chainStatus && <p className="subtext">{chainStatus}</p>}
    </div>
  );
}
