"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, PublicKey } from "@solana/web3.js";
import { prepareSignal, buildRecordSignalInstruction } from "../../lib/sdkPublish";
import { STREAM_REGISTRY_PROGRAM_ID, SUBSCRIPTION_PROGRAM_ID } from "../../lib/constants";
import type { StreamTier } from "../../lib/types";

export default function PublishSignal({
  streamId,
  tierId,
  tiers,
  streamVisibility,
  streamOnchainAddress,
}: {
  streamId: string;
  tierId: string;
  tiers?: StreamTier[];
  streamVisibility?: "public" | "private";
  streamOnchainAddress?: string;
}) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [message, setMessage] = useState("ETH best price at Venue X");
  const [selectedTier, setSelectedTier] = useState(tierId);
  const [preparedMeta, setPreparedMeta] = useState<any | null>(null);
  const [prepareStatus, setPrepareStatus] = useState<string | null>(null);
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);

  async function prepare() {
    if (!message.trim()) {
      setPrepareStatus("Signal message required.");
      return;
    }
    setPrepareLoading(true);
    setPrepareStatus(null);
    setRecordStatus(null);
    setPreparedMeta(null);
    setTxSig(null);
    try {
      const meta = await prepareSignal({
        streamId,
        tierId: selectedTier,
        plaintext: message,
      });
      setPreparedMeta(meta);
      setPrepareStatus(`Prepared signal ${meta.signalHash.slice(0, 10)}…`);
    } catch (err: any) {
      setPrepareStatus(err.message ?? "Failed to prepare");
    } finally {
      setPrepareLoading(false);
    }
  }

  async function recordOnchain() {
    if (!publicKey) {
      setRecordStatus("Connect your wallet to sign the on-chain publish.");
      return;
    }
    if (!preparedMeta) {
      setRecordStatus("Prepare the signal first.");
      return;
    }
    if (!SUBSCRIPTION_PROGRAM_ID || !STREAM_REGISTRY_PROGRAM_ID) {
      setRecordStatus("Program IDs not configured.");
      return;
    }
    setRecordLoading(true);
    setRecordStatus(null);
    try {
      const ix = await buildRecordSignalInstruction({
        programId: new PublicKey(SUBSCRIPTION_PROGRAM_ID),
        streamRegistryProgramId: new PublicKey(STREAM_REGISTRY_PROGRAM_ID),
        authority: publicKey,
        streamId,
        streamPubkey: streamOnchainAddress ? new PublicKey(streamOnchainAddress) : undefined,
        metadata: preparedMeta,
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const latest = await connection.getLatestBlockhash();
      tx.recentBlockhash = latest.blockhash;
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      setTxSig(sig);
      setRecordStatus(`On-chain publish ${sig.slice(0, 10)}…`);
    } catch (err: any) {
      setRecordStatus(err.message ?? "Failed to record on-chain");
    } finally {
      setRecordLoading(false);
    }
  }

  const step = txSig ? 3 : preparedMeta ? 2 : 1;
  const visibility = streamVisibility ?? "private";

  return (
    <>
      <div className="publish-steps">
        <div className={`publish-step ${step > 1 ? "publish-step--done" : ""} ${step === 1 ? "publish-step--active" : ""}`}>
          <span className="publish-step-dot">{step > 1 ? "✓" : "1"}</span>
          <span className="publish-step-label">Prepare</span>
        </div>
        <div className={`publish-step-line ${step >= 2 ? "publish-step-line--done" : ""}`} />
        <div className={`publish-step ${step > 2 ? "publish-step--done" : ""} ${step === 2 ? "publish-step--active" : ""}`}>
          <span className="publish-step-dot">{step > 2 ? "✓" : "2"}</span>
          <span className="publish-step-label">Publish</span>
        </div>
        <div className={`publish-step-line ${step >= 3 ? "publish-step-line--done" : ""}`} />
        <div className={`publish-step ${step === 3 ? "publish-step--active" : ""}`}>
          <span className="publish-step-dot">✓</span>
          <span className="publish-step-label">Published</span>
        </div>
      </div>

      {tiers && tiers.length > 1 && (
        <div className="field">
          <label>Tier</label>
          <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)}>
            {tiers.map((t) => (
              <option key={t.tierId} value={t.tierId}>
                {t.tierId} — {t.price}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label>Visibility</label>
        <div className="input" style={{ display: "flex", alignItems: "center", height: 44 }}>
          {visibility === "public" ? "Public (free)" : "Private (subscribers only)"}
        </div>
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {step === 1 && (
          <button className="button secondary" onClick={prepare} disabled={prepareLoading}>
            {prepareLoading ? "Preparing…" : "Prepare Signal"}
          </button>
        )}
        {step === 2 && (
          <button
            className="button primary"
            onClick={recordOnchain}
            disabled={recordLoading}
          >
            {recordLoading ? "Publishing…" : "Publish On-chain"}
          </button>
        )}
      </div>
      {prepareStatus && <p className="subtext">{prepareStatus}</p>}
      {recordStatus && <p className="subtext">{recordStatus}</p>}
      {txSig && (
        <p className="subtext">
          On-chain tx {txSig.slice(0, 10)}…
        </p>
      )}
    </>
  );
}
