"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { postJson } from "../lib/api";
import {
  buildCreateStreamInstruction,
  buildUpsertTierInstruction,
  deriveStreamPda,
  resolveStreamRegistryProgramId,
} from "../lib/streamRegistry";
import type { TierInput } from "../lib/tiersHash";
import { parseSolLamports } from "../lib/pricing";
import { explorerTx } from "../lib/constants";
import { parseQuota } from "../lib/utils";
import LeftNav from "../components/LeftNav";

const DEFAULT_TIER: TierInput = {
  tierId: "tier-basic",
  pricingType: "subscription_unlimited",
  price: "0.05 SOL/mo",
  quota: "100 signals",
  evidenceLevel: "trust",
};

export default function RegisterStreamPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  // ─── Step wizard ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [streamId, setStreamId] = useState("stream-");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [accuracy, setAccuracy] = useState("98%");
  const [latency, setLatency] = useState("2s");
  const [price, setPrice] = useState("0.05 SOL/mo");
  const [evidence, setEvidence] = useState("Verifier supported");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [dao, setDao] = useState(process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "");
  const [tiers, setTiers] = useState<TierInput[]>([{ ...DEFAULT_TIER }]);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployTx, setDeployTx] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  useEffect(() => {}, [publicKey]); // kept for lint

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function waitForStreamAccount(streamPda: import("@solana/web3.js").PublicKey, timeoutMs = 10_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const info = await connection.getAccountInfo(streamPda);
      if (info) return true;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }

  // ─── Tier management ──────────────────────────────────────────────────────

  function updateTier(index: number, patch: Partial<TierInput>) {
    setTiers((prev) => prev.map((tier, idx) => (idx === index ? { ...tier, ...patch } : tier)));
  }

  function addTier() {
    setTiers((prev) => [
      ...prev,
      {
        ...DEFAULT_TIER,
        tierId: `tier-${prev.length + 1}`,
        price: visibility === "public" ? "0 SOL/mo" : DEFAULT_TIER.price,
      },
    ]);
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== index));
  }

  useEffect(() => {
    if (visibility === "public") {
      setPrice("0 SOL/mo");
      setTiers((prev) => prev.map((tier) => ({ ...tier, price: "0 SOL/mo" })));
    }
  }, [visibility]);

  // ─── Step navigation ──────────────────────────────────────────────────────

  function goStep2() {
    if (!streamId || !name) {
      setDeployStatus("Stream ID and name are required.");
      return;
    }
    setDeployStatus(null);
    setStep(2);
  }

  // ─── Deploy ───────────────────────────────────────────────────────────────

  async function deploy() {
    if (!publicKey) {
      setDeployStatus("Connect your wallet first.");
      return;
    }
    setDeployLoading(true);
    setDeployStatus("Preparing on-chain transaction…");
    setDeployTx(null);
    setDeploySuccess(false);
    try {
      const programId = resolveStreamRegistryProgramId();
      const streamPda = await deriveStreamPda(programId, streamId);
      const existing = await connection.getAccountInfo(streamPda);
      let signature: string | null = null;

      if (!existing) {
        setDeployStatus("Sending create stream transaction…");
        const { instruction } = await buildCreateStreamInstruction({
          programId,
          authority: publicKey,
          streamId,
          tiers,
          dao: dao || undefined,
          visibility,
        });
        const tx = new Transaction().add(instruction);
        tx.feePayer = publicKey;
        const latest = await connection.getLatestBlockhash();
        tx.recentBlockhash = latest.blockhash;
        signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature, ...latest }, "confirmed");
        const ready = await waitForStreamAccount(streamPda);
        if (!ready) {
          throw new Error("Stream account not initialized yet. Try again in a moment.");
        }
        setDeployTx(signature);
      }

      if (tiers.length) {
        setDeployStatus("Registering tiers…");
        const streamReady = await connection.getAccountInfo(streamPda);
        if (!streamReady) {
          throw new Error("Stream account missing. Ensure create stream transaction is confirmed.");
        }
        const tierTx = new Transaction();
        for (const tier of tiers) {
          const quota = parseQuota(tier.quota) ?? 0;
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

      setDeployStatus("Publishing to backend…");
      await postJson("/streams", {
        id: streamId,
        name,
        domain,
        description,
        visibility,
        accuracy,
        latency,
        price,
        evidence,
        ownerWallet: publicKey.toBase58(),
        tiers,
        dao: dao || undefined,
      });

      setDeploySuccess(true);
      setDeployStatus(
        signature
          ? `Stream registered! Tx: ${signature.slice(0, 12)}…`
          : "Stream already on-chain. Listing published.",
      );
    } catch (err: unknown) {
      setDeployStatus(err instanceof Error ? err.message : "Failed to register stream");
    } finally {
      setDeployLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="social-shell">
      <LeftNav />

      <div className="social-main">
        <div className="maker-dash">
          <div className="maker-dash-header">
            <span className="kicker">Maker Dashboard</span>
            <h1 className="maker-dash-title">Streams &amp; Signals</h1>
            <p className="maker-dash-subtitle">
              Register your stream on-chain, then publish signals to your subscribers.
            </p>
          </div>

          {!publicKey && (
            <p className="subtext">Connect your wallet to register a stream.</p>
          )}

          {publicKey && (
            <>
          {/* Step indicator */}
          <div className="step-bar">
            {(
              [
                { n: 1, label: "Identity" },
                { n: 2, label: "Tiers" },
                { n: 3, label: "Deploy" },
              ] as const
            ).map(({ n, label }, idx) => (
              <div
                key={n}
                className={`step-item${step > n ? " step-item--done" : ""}${step === n ? " step-item--active" : ""}`}
              >
                {idx > 0 && <div className="step-connector" />}
                <div className="step-dot">{step > n ? "✓" : n}</div>
                <span className="step-label">{label}</span>
              </div>
            ))}
          </div>

          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <div className="step-content">
              <h3>Stream Identity</h3>
              <p className="subtext">Basic metadata for your stream.</p>
              <div className="form-grid form-grid--2col">
                <input
                  className="input"
                  value={streamId}
                  onChange={(e) => setStreamId(e.target.value)}
                  placeholder="stream-id (e.g. stream-eth-price)"
                />
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Stream name"
                />
                <input
                  className="input"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="Domain (e.g. pricing, crypto)"
                />
                <input
                  className="input"
                  value={accuracy}
                  onChange={(e) => setAccuracy(e.target.value)}
                  placeholder="Accuracy (e.g. 98%)"
                />
                <input
                  className="input"
                  value={latency}
                  onChange={(e) => setLatency(e.target.value)}
                  placeholder="Latency (e.g. 2s)"
                />
                <input
                  className="input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Base price (e.g. 0.05 SOL/mo)"
                  disabled={visibility === "public"}
                />
                <input
                  className="input"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="Evidence (e.g. Verifier supported)"
                />
                <select
                  className="input"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as "public" | "private")}
                >
                  <option value="private">Private stream (encrypted signals)</option>
                  <option value="public">Public stream (open signals)</option>
                </select>
                <input
                  className="input"
                  value={dao}
                  onChange={(e) => setDao(e.target.value)}
                  placeholder="DAO / Treasury address (optional)"
                />
              </div>
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of your stream"
                rows={3}
                style={{ marginBottom: 0 }}
              />
              {deployStatus && (
                <p className="subtext" style={{ color: "var(--accent)", marginTop: 8 }}>
                  {deployStatus}
                </p>
              )}
              <div className="step-actions">
                <button className="button primary" onClick={goStep2}>
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Tiers ── */}
          {step === 2 && (
            <div className="step-content">
              <h3>Subscription Tiers</h3>
              <p className="subtext">Define pricing tiers for your stream subscribers.</p>
              <div className="tier-block">
                {tiers.map((tier, idx) => (
                  <div key={idx} className="tier-row">
                    <input
                      className="input"
                      value={tier.tierId}
                      onChange={(e) => updateTier(idx, { tierId: e.target.value })}
                      placeholder="tier-id"
                    />
                    <input
                      className="input"
                      value={tier.price}
                      onChange={(e) => updateTier(idx, { price: e.target.value })}
                      placeholder="0.05 SOL/mo"
                      disabled={visibility === "public"}
                    />
                    <select
                      className="input"
                      value={tier.evidenceLevel}
                      onChange={(e) =>
                        updateTier(idx, { evidenceLevel: e.target.value as TierInput["evidenceLevel"] })
                      }
                    >
                      <option value="trust">trust</option>
                      <option value="verifier">verifier</option>
                    </select>
                    <input
                      className="input"
                      value={tier.quota ?? ""}
                      onChange={(e) => updateTier(idx, { quota: e.target.value })}
                      placeholder="quota (optional)"
                    />
                    {tiers.length > 1 && (
                      <button className="button ghost" onClick={() => removeTier(idx)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="button ghost" onClick={addTier} style={{ marginTop: 8 }}>
                + Add Tier
              </button>
              <div className="step-actions">
                <button className="button ghost" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button className="button primary" onClick={() => setStep(3)}>
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Deploy ── */}
          {step === 3 && (
            <div className="step-content">
              <h3>Deploy Stream</h3>
              <p className="subtext">Review and deploy your stream on-chain.</p>
              <div className="deploy-summary">
                <div className="deploy-summary-row">
                  <span>Stream ID</span>
                  <strong>{streamId}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Name</span>
                  <strong>{name}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Domain</span>
                  <strong>{domain || "—"}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Evidence</span>
                  <strong>{evidence}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Visibility</span>
                  <strong>{visibility === "public" ? "Public" : "Private"}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Base Price</span>
                  <strong>{price}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Tiers</span>
                  <strong>
                    {tiers.map((t) => t.tierId).join(", ")} ({tiers.length})
                  </strong>
                </div>
                {dao && (
                  <div className="deploy-summary-row">
                    <span>DAO</span>
                    <strong style={{ wordBreak: "break-all", fontSize: 12 }}>{dao}</strong>
                  </div>
                )}
              </div>

              {deployStatus && (
                <p
                  className="subtext"
                  style={{ marginTop: 12, color: deploySuccess ? "var(--accent-2)" : undefined }}
                >
                  {deployStatus}
                </p>
              )}

              {deployTx && (
                <a
                  className="link"
                  href={explorerTx(deployTx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 6 }}
                >
                  View on Explorer →
                </a>
              )}

              {deploySuccess && (
                <div style={{ marginTop: 8 }}>
                  <Link className="button ghost" href={`/stream/${streamId}`}>
                    View Stream →
                  </Link>
                </div>
              )}

              <div className="step-actions">
                <button className="button ghost" onClick={() => setStep(2)} disabled={deployLoading}>
                  ← Back
                </button>
                <button
                  className="button primary"
                  onClick={deploy}
                  disabled={deployLoading || !publicKey}
                >
                  {deployLoading ? "Deploying…" : "Deploy Stream"}
                </button>
              </div>

              {!publicKey && (
                <p className="subtext" style={{ marginTop: 8 }}>
                  Connect your wallet to deploy.
                </p>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
