"use client";

import { useState } from "react";
import { postJson } from "../../lib/api";

export default function PublishSignal({ streamId, tierId }: { streamId: string; tierId: string }) {
  const [message, setMessage] = useState("ETH best price at Venue X");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [status, setStatus] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  async function publish() {
    setStatus(null);
    setTxSig(null);
    try {
      const res = await postJson<{ metadata: { signalHash: string; onchainTx?: string } }>("/signals", {
        streamId,
        tierId,
        plaintextBase64: btoa(message),
        visibility,
      });
      const base = `Published signal ${res.metadata.signalHash.slice(0, 10)}…`;
      if (res.metadata.onchainTx) {
        setTxSig(res.metadata.onchainTx);
        setStatus(base);
      } else {
        setStatus(base);
      }
    } catch (err: any) {
      setStatus(err.message ?? "Failed");
    }
  }

  return (
    <div className="card">
      <div className="hud-corners" />
      <h3>Publish Demo Signal</h3>
      <p>Maker-only. Private signals are encrypted; public signals are open.</p>
      <div className="field">
        <label>Visibility</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
          <option value="private">Private (subscribers only)</option>
          <option value="public">Public (free)</option>
        </select>
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
      <button className="button primary" onClick={publish}>
        Publish
      </button>
      {status && <p className="subtext">{status}</p>}
      {txSig && (
        <p className="subtext">
          On-chain tx{" "}
          <a className="link" href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank">
            {txSig.slice(0, 10)}…
          </a>
        </p>
      )}
    </div>
  );
}
