"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { prepareSignal } from "../../lib/sdkPublish";
import { buildRecordSignalTransaction } from "../../lib/solana";
import type { StreamTier } from "../../lib/types";
import { toast } from "../../lib/toast";

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
  const [loading, setLoading] = useState(false);
  const [prepareDone, setPrepareDone] = useState(false);
  const [publishDone, setPublishDone] = useState(false);
  const [phase, setPhase] = useState<"idle" | "prepare" | "publish" | "done">("idle");
  const [statusText, setStatusText] = useState<string | null>(null);

  const visibility = streamVisibility ?? "private";

  async function prepare() {
    if (!message.trim()) {
      toast("Signal message required.", "warn");
      return;
    }
    setLoading(true);
    setPhase("prepare");
    setStatusText("Preparing signal…");
    setPreparedMeta(null);
    try {
      const meta = await prepareSignal({
        streamId,
        tierId: selectedTier,
        plaintext: message,
      });
      setPreparedMeta(meta);
      setPrepareDone(true);
      setPhase("publish");
      setStatusText(null);
      toast(`Prepared signal ${meta.signalHash.slice(0, 10)}…`, "success");
    } catch (err: any) {
      toast(err.message ?? "Failed to prepare", "error");
      setPhase("idle");
      setStatusText(null);
    } finally {
      setLoading(false);
    }
  }

  async function recordOnchain() {
    if (!publicKey) {
      toast("Connect your wallet to sign the on-chain publish.", "warn");
      return;
    }
    if (!preparedMeta) {
      toast("Prepare the signal first.", "warn");
      return;
    }
    setLoading(true);
    setPhase("publish");
    setStatusText("Confirm the transaction in your wallet…");
    try {
      const { transaction, latestBlockhash } = await buildRecordSignalTransaction({
        connection,
        authority: publicKey,
        streamId,
        streamPubkey: streamOnchainAddress,
        metadata: preparedMeta,
      });
      const sig = await sendTransaction(transaction, connection);
      setStatusText("Confirming on-chain…");
      await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
      setPublishDone(true);
      setPhase("done");
      setStatusText(null);
      toast(`On-chain publish confirmed ${sig.slice(0, 10)}…`, "success");
      setTimeout(() => {
        setPrepareDone(false);
        setPublishDone(false);
        setPreparedMeta(null);
        setPhase("idle");
      }, 5000);
    } catch (err: any) {
      toast(err.message ?? "Failed to record on-chain", "error");
      setStatusText(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {tiers && tiers.length > 1 && (
        <div className="md-field">
          <label className="md-label">Tier</label>
          <select className="md-select" value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)}>
            {tiers.map((t) => (
              <option key={t.tierId} value={t.tierId}>
                {t.tierId} — {t.price}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="md-field">
        <label className="md-label">Visibility</label>
        <div className="md-input" style={{ cursor: "default", opacity: 0.7 }}>
          {visibility === "public" ? "Public (free)" : "Private (subscribers only)"}
        </div>
      </div>
      <div className="md-field" style={{ marginTop: 8 }}>
        <label className="md-label">Signal</label>
        <textarea className="md-textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      {/* Deploy pipeline */}
      <div className="deploy-pipeline" style={{ marginTop: 16 }}>
        {/* Step 1: Prepare */}
        <button
          className={`deploy-pipeline-btn${
            prepareDone ? " deploy-pipeline-btn--done"
            : phase === "prepare" && loading ? " deploy-pipeline-btn--loading"
            : (phase === "idle" || phase === "prepare") && !prepareDone ? " deploy-pipeline-btn--active"
            : ""
          }`}
          onClick={!prepareDone && !loading ? prepare : undefined}
          disabled={prepareDone || loading}
        >
          {prepareDone ? "✓ Prepared" : phase === "prepare" && loading ? "Preparing…" : "Prepare Signal"}
        </button>

        <span className={`deploy-pipeline-arrow${prepareDone ? " deploy-pipeline-arrow--active" : ""}`}>→</span>

        {/* Step 2: Publish on-chain */}
        <button
          className={`deploy-pipeline-btn${
            publishDone ? " deploy-pipeline-btn--done"
            : phase === "publish" && loading ? " deploy-pipeline-btn--loading"
            : phase === "publish" && !loading ? " deploy-pipeline-btn--active"
            : ""
          }`}
          onClick={prepareDone && !publishDone && !loading ? recordOnchain : undefined}
          disabled={!prepareDone || publishDone || loading}
        >
          {publishDone ? "✓ Published" : phase === "publish" && loading ? "Publishing…" : "Publish On-chain"}
        </button>
      </div>

      {statusText && (
        <p className="subtext" style={{ marginTop: 8, textAlign: "right" }}>
          {statusText}
        </p>
      )}
    </>
  );
}
