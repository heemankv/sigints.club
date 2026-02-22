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
import { fetchStreams } from "../lib/api/streams";
import { explorerTx } from "../lib/constants";
import { parseQuota } from "../lib/utils";
import type { StreamDetail } from "../lib/types";

const DEFAULT_TIER: TierInput = {
  tierId: "tier-basic",
  pricingType: "subscription_unlimited",
  price: "0.05 SOL/mo",
  quota: "100 signals",
  evidenceLevel: "trust",
};

type ActiveTab = "register" | "mystreams";

export default function RegisterStreamPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  // ─── Tab ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("register");

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
  const [dao, setDao] = useState(process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "");
  const [tiers, setTiers] = useState<TierInput[]>([{ ...DEFAULT_TIER }]);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployTx, setDeployTx] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  // ─── My streams tab ───────────────────────────────────────────────────────
  const [myStreams, setMyStreams] = useState<StreamDetail[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [publishOpen, setPublishOpen] = useState<Record<string, boolean>>({});
  const [publishTier, setPublishTier] = useState<Record<string, string>>({});
  const [publishVisibility, setPublishVisibility] = useState<Record<string, "public" | "private">>({});
  const [publishMessage, setPublishMessage] = useState<Record<string, string>>({});
  const [publishStatus, setPublishStatus] = useState<Record<string, string | null>>({});
  const [publishLoading, setPublishLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeTab === "mystreams") {
      void loadMyStreams();
    }
  }, [activeTab, publicKey]);

  async function loadMyStreams() {
    setStreamsLoading(true);
    try {
      const data = await fetchStreams({ includeTiers: true });
      const walletAddr = publicKey?.toBase58();
      const mine = walletAddr
        ? (data.streams ?? []).filter((s) => s.authority === walletAddr)
        : [];
      setMyStreams(mine);
      const tierDefaults: Record<string, string> = {};
      const visDefaults: Record<string, "public" | "private"> = {};
      mine.forEach((s) => {
        tierDefaults[s.id] = s.tiers?.[0]?.tierId ?? "";
        visDefaults[s.id] = "public";
      });
      setPublishTier(tierDefaults);
      setPublishVisibility(visDefaults);
    } catch {
      setMyStreams([]);
    } finally {
      setStreamsLoading(false);
    }
  }

  // ─── Tier management ──────────────────────────────────────────────────────

  function updateTier(index: number, patch: Partial<TierInput>) {
    setTiers((prev) => prev.map((tier, idx) => (idx === index ? { ...tier, ...patch } : tier)));
  }

  function addTier() {
    setTiers((prev) => [...prev, { ...DEFAULT_TIER, tierId: `tier-${prev.length + 1}` }]);
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== index));
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
        });
        const tx = new Transaction().add(instruction);
        tx.feePayer = publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        signature = await sendTransaction(tx, connection);
        setDeployTx(signature);
      }

      if (tiers.length) {
        setDeployStatus("Registering tiers…");
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

  // ─── Publish signal ───────────────────────────────────────────────────────

  async function publishSignal(sid: string) {
    const tierId = publishTier[sid];
    const visibility = publishVisibility[sid] ?? "public";
    const message = publishMessage[sid] ?? "";
    if (!message) {
      setPublishStatus((prev) => ({ ...prev, [sid]: "Message is required." }));
      return;
    }
    setPublishLoading((prev) => ({ ...prev, [sid]: true }));
    setPublishStatus((prev) => ({ ...prev, [sid]: null }));
    try {
      const plaintextBase64 = btoa(unescape(encodeURIComponent(message)));
      const result = await postJson<{ signal?: { hash?: string }; onchainTx?: string }>(
        "/signals",
        { streamId: sid, tierId, plaintextBase64, visibility },
      );
      const hash = result?.signal?.hash ?? "";
      const txSig = result?.onchainTx ?? "";
      let statusMsg = hash ? `Signal published. Hash: ${hash.slice(0, 16)}…` : "Signal published.";
      if (txSig) statusMsg += ` · Tx: ${txSig.slice(0, 10)}…`;
      setPublishStatus((prev) => ({ ...prev, [sid]: statusMsg }));
      setPublishMessage((prev) => ({ ...prev, [sid]: "" }));
    } catch (err: unknown) {
      setPublishStatus((prev) => ({
        ...prev,
        [sid]: err instanceof Error ? err.message : "Failed to publish",
      }));
    } finally {
      setPublishLoading((prev) => ({ ...prev, [sid]: false }));
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

      {/* Tab bar */}
      <div className="maker-tabs">
        <button
          className={`maker-tab${activeTab === "register" ? " maker-tab--active" : ""}`}
          onClick={() => setActiveTab("register")}
        >
          Register Stream
        </button>
        <button
          className={`maker-tab${activeTab === "mystreams" ? " maker-tab--active" : ""}`}
          onClick={() => setActiveTab("mystreams")}
        >
          My Streams
        </button>
      </div>

      {/* ── Tab 1: Step wizard ── */}
      {activeTab === "register" && !publicKey && (
        <div className="module">
          <p className="subtext">Connect your wallet to register a stream.</p>
        </div>
      )}

      {activeTab === "register" && publicKey && (
        <div className="module">
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
                />
                <input
                  className="input"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="Evidence (e.g. Verifier supported)"
                />
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
        </div>
      )}

      {/* ── Tab 2: My Streams ── */}
      {activeTab === "mystreams" && (
        <div>
          {!publicKey && (
            <div className="module">
              <p className="subtext">Connect your wallet to view your streams.</p>
            </div>
          )}

          {publicKey && streamsLoading && (
            <div className="module">
              <p className="subtext">Loading your streams…</p>
            </div>
          )}

          {publicKey && !streamsLoading && myStreams.length === 0 && (
            <div className="module">
              <p className="subtext">
                No streams registered yet. Switch to the Register tab to get started.
              </p>
              <button className="button ghost" onClick={() => setActiveTab("register")}>
                Register Stream →
              </button>
            </div>
          )}

          {publicKey && !streamsLoading && myStreams.length > 0 && (
            <div className="stream-card-grid">
              {myStreams.map((stream) => {
                const isOpen = publishOpen[stream.id] ?? false;
                const selTier = publishTier[stream.id] ?? stream.tiers?.[0]?.tierId ?? "";
                const visibility = publishVisibility[stream.id] ?? "public";
                const message = publishMessage[stream.id] ?? "";
                const loading = publishLoading[stream.id] ?? false;
                const sigStatus = publishStatus[stream.id];

                return (
                  <div className="stream-card" key={stream.id}>
                    <div className="stream-card-header">
                      {stream.domain && (
                        <span className="badge badge-teal">{stream.domain}</span>
                      )}
                      {stream.evidence && (
                        <span className="badge badge-gold">{stream.evidence}</span>
                      )}
                    </div>

                    <h3 className="stream-card-name">{stream.name}</h3>

                    {stream.description && (
                      <p className="stream-card-desc">
                        {stream.description.length > 100
                          ? `${stream.description.slice(0, 100)}…`
                          : stream.description}
                      </p>
                    )}

                    <div className="stream-card-meta">
                      {stream.accuracy && <span>{stream.accuracy} accuracy</span>}
                      {stream.latency && <span>{stream.latency} latency</span>}
                    </div>

                    {stream.tiers?.length > 0 && (
                      <div className="chip-row" style={{ marginTop: 8 }}>
                        {stream.tiers.map((t) => (
                          <span className="chip" key={t.tierId}>
                            {t.tierId}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="stream-card-actions">
                      <Link className="button ghost" href={`/stream/${stream.id}`}>
                        View Stream →
                      </Link>
                      <button
                        className="button primary"
                        onClick={() =>
                          setPublishOpen((prev) => ({ ...prev, [stream.id]: !isOpen }))
                        }
                      >
                        {isOpen ? "Close ▲" : "Publish Signal ▾"}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="stream-publish-panel">
                        <div className="stream-publish-row">
                          <label className="publish-label">Tier</label>
                          <select
                            className="input"
                            value={selTier}
                            onChange={(e) =>
                              setPublishTier((prev) => ({ ...prev, [stream.id]: e.target.value }))
                            }
                          >
                            {stream.tiers.map((t) => (
                              <option key={t.tierId} value={t.tierId}>
                                {t.tierId} — {t.price}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="stream-publish-row">
                          <label className="publish-label">Visibility</label>
                          <div className="publish-vis-toggle">
                            <button
                              className={`vis-btn${visibility === "public" ? " vis-btn--active" : ""}`}
                              onClick={() =>
                                setPublishVisibility((prev) => ({
                                  ...prev,
                                  [stream.id]: "public",
                                }))
                              }
                            >
                              Public
                            </button>
                            <button
                              className={`vis-btn${visibility === "private" ? " vis-btn--active" : ""}`}
                              onClick={() =>
                                setPublishVisibility((prev) => ({
                                  ...prev,
                                  [stream.id]: "private",
                                }))
                              }
                            >
                              Private
                            </button>
                          </div>
                        </div>

                        <textarea
                          className="input"
                          value={message}
                          onChange={(e) =>
                            setPublishMessage((prev) => ({ ...prev, [stream.id]: e.target.value }))
                          }
                          placeholder="Signal message…"
                          rows={3}
                          style={{ marginBottom: 0 }}
                        />

                        <button
                          className="button primary"
                          onClick={() => publishSignal(stream.id)}
                          disabled={loading}
                          style={{ marginTop: 10 }}
                        >
                          {loading ? "Publishing…" : "Publish"}
                        </button>

                        {sigStatus && (
                          <p className="subtext" style={{ marginTop: 8 }}>
                            {sigStatus}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
