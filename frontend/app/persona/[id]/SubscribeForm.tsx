"use client";

import { useState } from "react";
import { postJson } from "../../lib/api";

export default function SubscribeForm({
  personaId,
  tierId,
  pricingType,
  evidenceLevel,
  quota,
}: {
  personaId: string;
  tierId: string;
  pricingType: string;
  evidenceLevel: string;
  quota?: string;
}) {
  const [pubKey, setPubKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [chainTx, setChainTx] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setStatus(null);
    try {
      const data = await postJson<{ subscriberId: string }>("/subscribe", {
        personaId,
        encPubKeyDerBase64: pubKey,
      });
      setStatus(`Subscribed. Subscriber ID: ${data.subscriberId}`);
    } catch (err: any) {
      setStatus(err.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  function parseQuota(input?: string): number | undefined {
    if (!input) return undefined;
    const match = input.match(/\\d+/);
    if (!match) return undefined;
    return Number(match[0]);
  }

  async function submitOnchain() {
    setLoading(true);
    setChainStatus(null);
    setChainTx(null);
    try {
      const signature = await postJson<{ signature: string }>("/subscribe/onchain", {
        personaId,
        tierId,
        pricingType,
        evidenceLevel,
        quotaRemaining: parseQuota(quota),
      });
      setChainTx(signature.signature);
      setChainStatus(`On-chain subscription submitted.`);
    } catch (err: any) {
      setChainStatus(err.message ?? "On-chain subscribe failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Subscribe to {tierId}</h3>
      <p>Paste your encryption public key (base64).</p>
      <input
        value={pubKey}
        onChange={(e) => setPubKey(e.target.value)}
        placeholder="Base64 X25519 public key"
        className="input"
      />
      <button className="button primary" onClick={submit} disabled={loading || !pubKey}>
        {loading ? "Subscribing…" : "Subscribe"}
      </button>
      {status && <p className="subtext">{status}</p>}
      <div className="divider" />
      <p className="subtext">On-chain demo uses backend wallet as subscriber.</p>
      <button className="button ghost" onClick={submitOnchain} disabled={loading}>
        {loading ? "Submitting…" : "Subscribe on-chain"}
      </button>
      {chainStatus && <p className="subtext">{chainStatus}</p>}
      {chainTx && (
        <p className="subtext">
          Explorer{" "}
          <a className="link" href={`https://explorer.solana.com/tx/${chainTx}?cluster=devnet`} target="_blank">
            {chainTx.slice(0, 10)}…
          </a>
        </p>
      )}
    </div>
  );
}
