"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { createStream as sdkCreateStream } from "../lib/sdkBackend";
import {
  buildCreateStreamInstruction,
  buildUpsertTierInstruction,
  deriveStreamPda,
  resolveStreamRegistryProgramId,
} from "../lib/streamRegistry";
import type { TierInput } from "../lib/streamRegistry";
import { parseSolLamports } from "../lib/pricing";

export default function RegisterStreamPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

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
      const tier = buildTier();
      const tiers = [tier];
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

      setDeployStatus("Registering tier…");
      const streamReady = await connection.getAccountInfo(streamPda);
      if (!streamReady) {
        throw new Error("Stream account missing. Ensure create stream transaction is confirmed.");
      }
      const tierTx = new Transaction();
      const ix = await buildUpsertTierInstruction({
        programId,
        authority: publicKey,
        stream: streamPda,
        tier,
        priceLamports: parseSolLamports(tier.price),
        quota: 0,
        status: 1,
      });
      tierTx.add(ix);
      tierTx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tierTx.recentBlockhash = blockhash;
      await sendTransaction(tierTx, connection);

      setDeployStatus("Publishing to backend…");
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
        tiers,
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
                <select
                  className="input"
                  value={visibility}
                  aria-label="Visibility"
                  onChange={(e) => setVisibility(e.target.value as "public" | "private")}
                >
                  <option value="private">Private stream (encrypted signals)</option>
                  <option value="public">Public stream (open signals)</option>
                </select>
                <select
                  className="input"
                  value={intervalType}
                  aria-label="Signal Interval"
                  onChange={(e) => setIntervalType(e.target.value as "unintervalled" | "intervalled")}
                >
                  <option value="unintervalled">Un-intervalled (event-driven)</option>
                  <option value="intervalled">Intervalled (scheduled)</option>
                </select>
                {intervalType === "intervalled" && (
                  <input
                    className="input"
                    value={cronSchedule}
                    onChange={(e) => setCronSchedule(e.target.value)}
                    placeholder="Cron schedule (e.g. 0 0 * * *)"
                  />
                )}
              </div>

              {/* Subscription price + Verifier side by side */}
              <div className="form-grid form-grid--2col" style={{ marginTop: 16 }}>
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
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={verifierSupported}
                      onChange={(e) => setVerifierSupported(e.target.checked)}
                    />
                    <span>Verifier supported</span>
                  </label>
                  <p className="subtext" style={{ margin: "6px 0 0" }}>
                    Enable on-chain verification for signal accuracy.
                  </p>
                </div>
              </div>

              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of your stream"
                rows={3}
                style={{ marginTop: 16, marginBottom: 0 }}
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

              {deployStatus && (
                <p
                  className="subtext"
                  style={{ marginTop: 12, color: deploySuccess ? "var(--accent-2)" : undefined }}
                >
                  {deployStatus}
                </p>
              )}

              {deploySuccess && (
                <div style={{ marginTop: 8 }}>
                  <Link className="button ghost" href={`/stream/${streamId}`}>
                    View Stream →
                  </Link>
                </div>
              )}

              {!deploySuccess && (
                <div className="step-actions">
                  <button className="button ghost" onClick={() => setStep(1)} disabled={deployLoading}>
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
              )}

              {!publicKey && !deploySuccess && (
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
