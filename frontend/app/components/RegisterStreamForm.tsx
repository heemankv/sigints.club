"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { postJson } from "../lib/api";
import {
  buildCreateStreamInstruction,
  buildUpsertTierInstruction,
  deriveStreamPda,
  resolveStreamRegistryProgramId,
} from "../lib/streamRegistry";
import { TierInput } from "../lib/tiersHash";
import { parseSolLamports } from "../lib/pricing";

type StreamPayload = {
  id: string;
  name: string;
  domain: string;
  description: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  ownerWallet: string;
  tiers: TierInput[];
};

const DEFAULT_TIER: TierInput = {
  tierId: "tier-basic",
  pricingType: "subscription_unlimited",
  price: "0.05 SOL/mo",
  quota: "100 signals",
  evidenceLevel: "trust",
};

export default function RegisterStreamForm() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamId, setStreamId] = useState("stream-");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [accuracy, setAccuracy] = useState("98%");
  const [latency, setLatency] = useState("2s");
  const [price, setPrice] = useState("0.05 SOL/mo");
  const [evidence, setEvidence] = useState("Verifier supported");
  const [dao, setDao] = useState(process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "");
  const [tiers, setTiers] = useState<TierInput[]>([{ ...DEFAULT_TIER }]);

  function updateTier(index: number, patch: Partial<TierInput>) {
    setTiers((prev) => prev.map((tier, idx) => (idx === index ? { ...tier, ...patch } : tier)));
  }

  function addTier() {
    setTiers((prev) => [...prev, { ...DEFAULT_TIER, tierId: `tier-${prev.length + 1}` }]);
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function submit() {
    if (!publicKey) {
      setStatus("Connect your wallet first.");
      return;
    }
    if (!streamId || !name) {
      setStatus("Stream ID and name are required.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const programId = resolveStreamRegistryProgramId();
      const streamPda = await deriveStreamPda(programId, streamId);
      const existing = await connection.getAccountInfo(streamPda);
      let signature: string | null = null;
      if (!existing) {
        const { instruction } = await buildCreateStreamInstruction({
          programId,
          authority: publicKey,
          streamId,
          tiers,
          dao: dao || undefined,
        });
        const tx = new Transaction().add(instruction);
        tx.feePayer = publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        signature = await sendTransaction(tx, connection);
      }
      if (tiers.length) {
        const tierTx = new Transaction();
        for (const tier of tiers) {
          const quota = tier.quota ? Number(tier.quota.match(/\d+/)?.[0] ?? 0) : 0;
          const ix = await buildUpsertTierInstruction({
            programId,
            authority: publicKey,
            stream: streamPda,
            tier,
            priceLamports: parseSolLamports(tier.price),
            quota,
            status: 1,
          });
          tierTx.add(ix);
        }
        tierTx.feePayer = publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tierTx.recentBlockhash = blockhash;
        await sendTransaction(tierTx, connection);
      }
      const payload: StreamPayload = {
        id: streamId,
        name,
        domain,
        description,
        accuracy,
        latency,
        price,
        evidence,
        ownerWallet: publicKey.toBase58(),
        tiers,
      };
      await postJson("/streams", payload);
      if (signature) {
        setStatus(`Stream registered on-chain. Tx ${signature.slice(0, 10)}…`);
      } else {
        setStatus("On-chain stream already exists. Listing published.");
      }
    } catch (err: any) {
      setStatus(err.message ?? "Failed to register stream");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="module accent-teal">
      <div className="hud-corners" />
      <h3>Register Stream (On-chain enforced)</h3>
      <p className="subtext">
        Create the on-chain stream registry entry, then publish metadata so it appears in Explore.
      </p>
      <div className="form-grid">
        <input
          className="input"
          value={streamId}
          onChange={(e) => setStreamId(e.target.value)}
          placeholder="stream-id"
        />
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Stream name" />
        <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Domain" />
        <input className="input" value={accuracy} onChange={(e) => setAccuracy(e.target.value)} placeholder="Accuracy" />
        <input className="input" value={latency} onChange={(e) => setLatency(e.target.value)} placeholder="Latency" />
        <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" />
        <input className="input" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence" />
        <input className="input" value={dao} onChange={(e) => setDao(e.target.value)} placeholder="DAO pubkey (optional)" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
      </div>

      <div className="tier-block">
        <div className="section-head">
          <span className="kicker">Tiers</span>
          <h4>Subscription tiers</h4>
        </div>
        {tiers.map((tier, idx) => (
          <div key={idx} className="tier-row">
            <input
              className="input"
              value={tier.tierId}
              onChange={(e) => updateTier(idx, { tierId: e.target.value })}
              placeholder="tier-id"
            />
            <select
              className="input"
              value={tier.pricingType}
              onChange={(e) => updateTier(idx, { pricingType: e.target.value as TierInput["pricingType"] })}
            >
              <option value="subscription_unlimited">subscription_unlimited</option>
            </select>
            <input
              className="input"
              value={tier.price}
              onChange={(e) => updateTier(idx, { price: e.target.value })}
              placeholder="0.05 SOL/mo"
            />
            <input
              className="input"
              value={tier.quota ?? ""}
              onChange={(e) => updateTier(idx, { quota: e.target.value })}
              placeholder="quota (optional)"
            />
            <select
              className="input"
              value={tier.evidenceLevel}
              onChange={(e) => updateTier(idx, { evidenceLevel: e.target.value as TierInput["evidenceLevel"] })}
            >
              <option value="trust">trust</option>
              <option value="verifier">verifier</option>
            </select>
            {tiers.length > 1 && (
              <button className="button ghost" onClick={() => removeTier(idx)}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button className="button ghost" onClick={addTier}>
          Add tier
        </button>
      </div>

      <button className="button primary" onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register Stream"}
      </button>
      {status && <p className="subtext">{status}</p>}
    </div>
  );
}
