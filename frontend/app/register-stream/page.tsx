"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createStream as sdkCreateStream } from "../lib/sdkBackend";
import {
  buildCreateStreamTransaction,
  buildUpsertTiersTransaction,
  deriveStreamPda,
  resolveStreamRegistryId,
  type TierInput,
} from "../lib/solana";
import { parseSolLamports } from "../lib/pricing";
import { toast } from "../lib/toast";

export default function RegisterStreamPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const verifierFormat = JSON.stringify(
    {
      signal: {
        value: "Your signal payload",
        timestamp: "YYYY-MM-DDTHH:mm:ssZ",
      },
      evidence: {
        evidence_hash: "sha256:...",
        evidence_pointer: "ipfs://... or https://...",
        source_type: "api | onchain | screenshot",
        source_ref: "url-or-tx-hash",
        captured_at: "YYYY-MM-DDTHH:mm:ssZ",
        proof_type: "log | screenshot | tx",
      },
    },
    null,
    2
  );

  // ─── Step wizard (2 steps: Identity → Deploy) ──────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [streamId, setStreamId] = useState("stream-");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [subscriptionPrice, setSubscriptionPrice] = useState(0.05);
  const [verifierSupported, setVerifierSupported] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [intervalType, setIntervalType] = useState<"unintervalled" | "intervalled">("unintervalled");
  const [cronSchedule, setCronSchedule] = useState("0 0 * * *");
  const [deployPhase, setDeployPhase] = useState<"idle" | "stream" | "tier" | "indexing" | "done">("idle");
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [tierDone, setTierDone] = useState(false);

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

  // ─── Derived tier (single, auto-generated) ─────────────────────────────────

  const effectivePrice = visibility === "public" ? 0 : subscriptionPrice;
  const priceStr = `${effectivePrice} SOL/mo`;
  const evidenceLevel: "trust" | "verifier" = verifierSupported ? "verifier" : "trust";

  function buildTier(): TierInput {
    return {
      tierId: `${streamId}-tier`,
      pricingType: "subscription_unlimited",
      price: priceStr,
      evidenceLevel,
    };
  }

  // ─── Step navigation ──────────────────────────────────────────────────────

  function goStep2() {
    if (!streamId || !name) {
      setDeployStatus("Stream ID and name are required.");
      return;
    }
    setDeployStatus(null);
    setStep(2);
  }

  async function copyVerifierFormat() {
    try {
      await navigator.clipboard.writeText(verifierFormat);
      toast("Verification format copied to clipboard.", "success");
    } catch (error) {
      console.error(error);
      toast("Failed to copy format. Please try again.", "error");
    }
  }

  // ─── Deploy: 3-phase pipeline ────────────────────────────────────────────

  async function deployStream() {
    if (!publicKey) { toast("Connect your wallet first.", "warn"); return; }
    setDeployLoading(true);
    setDeployPhase("stream");
    setDeployStatus("Preparing stream transaction…");
    try {
      const tier = buildTier();
      const tiers = [tier];
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, streamId);
      const existing = await connection.getAccountInfo(streamPda);

      if (existing) {
        setStreamDone(true);
        setDeployPhase("tier");
        setDeployStatus(null);
        toast("Stream already exists on-chain. Proceed to deploy tier.", "success");
        return;
      }

      setDeployStatus("Confirm the transaction in your wallet…");
      const { transaction, latestBlockhash } = await buildCreateStreamTransaction({
        connection,
        authority: publicKey,
        streamId,
        tiers,
        visibility,
      });
      const signature = await sendTransaction(transaction, connection);
      setDeployStatus("Confirming on-chain…");
      await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
      const ready = await waitForStreamAccount(streamPda);
      if (!ready) throw new Error("Stream account not initialized yet. Try again in a moment.");

      setStreamDone(true);
      setDeployPhase("tier");
      setDeployStatus(null);
      toast(`Stream deployed! Tx ${signature.slice(0, 12)}…`, "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to deploy stream", "error");
      setDeployPhase("idle");
      setDeployStatus(null);
    } finally {
      setDeployLoading(false);
    }
  }

  async function deployTier() {
    if (!publicKey) { toast("Connect your wallet first.", "warn"); return; }
    setDeployLoading(true);
    setDeployPhase("tier");
    setDeployStatus("Preparing tier transaction…");
    try {
      const tier = buildTier();
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, streamId);
      const streamReady = await connection.getAccountInfo(streamPda);
      if (!streamReady) throw new Error("Stream account missing. Deploy the stream first.");

      setDeployStatus("Confirm the transaction in your wallet…");
      const { transaction } = await buildUpsertTiersTransaction({
        connection,
        authority: publicKey,
        stream: streamPda,
        tiers: [{ tier, priceLamports: parseSolLamports(tier.price), quota: 0, status: 1 }],
      });
      await sendTransaction(transaction, connection);

      setTierDone(true);
      setDeployStatus(null);
      toast("Tier deployed!", "success");

      // Auto-trigger indexing
      await indexBackend();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to deploy tier", "error");
      setDeployStatus(null);
    } finally {
      setDeployLoading(false);
    }
  }

  async function indexBackend() {
    if (!publicKey) return;
    setDeployPhase("indexing");
    setDeployStatus(null);
    toast("Indexing on backend…", "success");
    try {
      const tier = buildTier();
      await sdkCreateStream({
        id: streamId,
        name,
        domain,
        description,
        visibility,
        price: priceStr,
        evidence: verifierSupported ? "Verifier supported" : "",
        signalInterval: intervalType,
        cronSchedule: intervalType === "intervalled" ? cronSchedule : undefined,
        ownerWallet: publicKey.toBase58(),
        tiers: [tier],
      });
      setDeployPhase("done");
      setDeployStatus(null);
      toast("Stream indexed and live!", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to index on backend", "error");
      setDeployStatus(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
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
                { n: 2, label: "Deploy" },
              ] as const
            ).map(({ n, label }) => (
              <div
                key={n}
                className={`step-item${step > n ? " step-item--done" : ""}${step === n ? " step-item--active" : ""}`}
              >
                <div className="step-dot">{step > n ? "✓" : n}</div>
                <span className="step-label">{label}</span>
              </div>
            ))}
          </div>

          {/* ── Step 1: Identity + Tier ── */}
          {step === 1 && (
            <div className="step-content">
              <h3>Stream Identity</h3>
              <p className="subtext">Basic metadata and pricing for your stream.</p>
              <div className="md-grid md-grid--2col">
                <div className="md-field">
                  <label className="md-label">Stream ID</label>
                  <input
                    className="md-input"
                    value={streamId}
                    onChange={(e) => setStreamId(e.target.value)}
                    placeholder="stream-eth-price"
                  />
                </div>
                <div className="md-field">
                  <label className="md-label">Name</label>
                  <input
                    className="md-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ETH Price Feed"
                  />
                </div>
                <div className="md-field">
                  <label className="md-label">Domain</label>
                  <input
                    className="md-input"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="pricing, crypto"
                  />
                </div>
                <div className="md-field">
                  <label className="md-label">Visibility</label>
                  <select
                    className="md-select"
                    value={visibility}
                    aria-label="Visibility"
                    onChange={(e) => setVisibility(e.target.value as "public" | "private")}
                  >
                    <option value="private">Private stream (encrypted signals)</option>
                    <option value="public">Public stream (open signals)</option>
                  </select>
                </div>
                <div className="md-field">
                  <label className="md-label">Signal Interval</label>
                  <select
                    className="md-select"
                    value={intervalType}
                    aria-label="Signal Interval"
                    onChange={(e) => setIntervalType(e.target.value as "unintervalled" | "intervalled")}
                  >
                    <option value="unintervalled">Un-intervalled (event-driven)</option>
                    <option value="intervalled">Intervalled (scheduled)</option>
                  </select>
                </div>
                {intervalType === "intervalled" && (
                  <div className="md-field">
                    <label className="md-label">Cron Schedule</label>
                    <input
                      className="md-input"
                      value={cronSchedule}
                      onChange={(e) => setCronSchedule(e.target.value)}
                      placeholder="0 0 * * *"
                    />
                  </div>
                )}
              </div>

              {/* Subscription price + Verifier side by side */}
              <div className="md-grid md-grid--2col" style={{ marginTop: 20 }}>
                <div className="slider-field">
                  <div className="slider-field-header">
                    <span className="slider-field-label">Subscription price</span>
                    <span className="slider-field-value">
                      {visibility === "public" ? "Free" : `${effectivePrice.toFixed(2)} SOL/mo`}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="range-slider"
                    min={0.01}
                    max={10}
                    step={0.01}
                    value={subscriptionPrice}
                    onChange={(e) => setSubscriptionPrice(parseFloat(e.target.value))}
                    disabled={visibility === "public"}
                  />
                  <div className="slider-field-ticks">
                    <span>0.01 SOL</span>
                    <span>10 SOL</span>
                  </div>
                </div>

                <div className="register-verifier-panel">
                  <div className="register-verifier-row">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={verifierSupported}
                        onChange={(e) => setVerifierSupported(e.target.checked)}
                      />
                      <span>Verifier supported</span>
                    </label>
                    <button
                      className="button ghost verifier-copy-btn"
                      type="button"
                      onClick={copyVerifierFormat}
                      disabled={!verifierSupported}
                      aria-disabled={!verifierSupported}
                    >
                      Copy Format
                    </button>
                  </div>
                  <p className="subtext" style={{ margin: "6px 0 0" }}>
                    Enable on-chain verification for signal accuracy.
                  </p>
                </div>
              </div>

              <div className="md-field md-grid--full" style={{ marginTop: 20 }}>
                <label className="md-label">Description</label>
                <textarea
                  className="md-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of your stream"
                />
              </div>
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

          {/* ── Step 2: Deploy ── */}
          {step === 2 && (
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
                  <span>Visibility</span>
                  <strong>{visibility === "public" ? "Public" : "Private"}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Subscription</span>
                  <strong>{visibility === "public" ? "Free" : priceStr}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Signal Interval</span>
                  <strong>
                    {intervalType === "unintervalled"
                      ? "Un-intervalled (event-driven)"
                      : `Intervalled (${cronSchedule})`}
                  </strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Verifier</span>
                  <strong>{verifierSupported ? "Yes" : "No"}</strong>
                </div>
              </div>

              {/* Deploy pipeline */}
              <div className="deploy-pipeline">
                {deployPhase === "idle" && (
                  <button className="button ghost" onClick={() => setStep(1)} style={{ marginRight: "auto" }}>
                    ← Back
                  </button>
                )}

                {/* Step 1: Deploy Stream */}
                <button
                  className={`deploy-pipeline-btn${
                    streamDone ? " deploy-pipeline-btn--done"
                    : deployPhase === "stream" && deployLoading ? " deploy-pipeline-btn--loading"
                    : (deployPhase === "idle" || deployPhase === "stream") && !streamDone ? " deploy-pipeline-btn--active"
                    : ""
                  }`}
                  onClick={!streamDone && !deployLoading ? deployStream : undefined}
                  disabled={streamDone || deployLoading}
                >
                  {streamDone ? "✓ Stream" : deployPhase === "stream" && deployLoading ? "Deploying…" : "Deploy Stream"}
                </button>

                <span className={`deploy-pipeline-arrow${streamDone ? " deploy-pipeline-arrow--active" : ""}`}>→</span>

                {/* Step 2: Deploy Tier */}
                <button
                  className={`deploy-pipeline-btn${
                    tierDone ? " deploy-pipeline-btn--done"
                    : deployPhase === "tier" && deployLoading ? " deploy-pipeline-btn--loading"
                    : deployPhase === "tier" && !deployLoading ? " deploy-pipeline-btn--active"
                    : ""
                  }`}
                  onClick={streamDone && !tierDone && !deployLoading ? deployTier : undefined}
                  disabled={!streamDone || tierDone || deployLoading}
                >
                  {tierDone ? "✓ Tier" : deployPhase === "tier" && deployLoading ? "Deploying…" : "Deploy Tier"}
                </button>

                <span className={`deploy-pipeline-arrow${tierDone ? " deploy-pipeline-arrow--active" : ""}`}>→</span>

                {/* Step 3: Indexing (auto) */}
                <span className={`deploy-pipeline-status${deployPhase === "indexing" ? " deploy-pipeline-status--active" : ""}`}>
                  {deployPhase === "done" ? "✓ Indexed" : deployPhase === "indexing" ? "Indexing…" : "Indexing"}
                </span>
              </div>

              {deployStatus && (
                <p className="subtext" style={{ marginTop: 12, textAlign: "right" }}>
                  {deployStatus}
                </p>
              )}

              {deployPhase === "done" && (
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <Link className="button ghost" href={`/stream/${streamId}`}>
                    View Stream →
                  </Link>
                </div>
              )}

              {!publicKey && deployPhase === "idle" && (
                <p className="subtext" style={{ marginTop: 8 }}>
                  Connect your wallet to deploy.
                </p>
              )}
            </div>
          )}
            </>
          )}
        </div>
  );
}
