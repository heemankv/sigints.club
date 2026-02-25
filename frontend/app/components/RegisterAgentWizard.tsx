"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAgent as sdkCreateAgent,
  createAgentSubscription as sdkCreateAgentSubscription,
} from "../lib/sdkBackend";
import {
  buildGrantPublisherInstruction,
  deriveStreamPda,
  resolveStreamRegistryId,
} from "../lib/solana";
import type { StreamDetail, OwnedSubscriptionOption } from "../lib/types";

type RegisterAgentWizardProps = {
  walletAddr: string;
  streamCatalog: StreamDetail[];
  ownedSubscriptionOptions: OwnedSubscriptionOption[];
  onAgentCreated: () => void;
  heading?: string;
  basicsMode?: "full" | "nameOnly";
  roleMode?: "both" | "senderOnly" | "listenerOnly";
  lockStreamId?: boolean;
  preset?: {
    senderEnabled?: boolean;
    listenerEnabled?: boolean;
    streamId?: string;
    listenerStreamIds?: string[];
    initialStep?: 1 | 2 | 3 | 4;
    domain?: string;
    evidence?: "trust" | "verifier" | "hybrid";
  };
};

type DeployStep = {
  label: string;
  status: "pending" | "active" | "done" | "error";
  error?: string;
};

export default function RegisterAgentWizard({
  walletAddr,
  streamCatalog,
  ownedSubscriptionOptions,
  onAgentCreated,
  heading = "Register Agent",
  basicsMode = "full",
  roleMode = "both",
  lockStreamId = false,
  preset,
}: RegisterAgentWizardProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const initialStep = preset?.initialStep ?? 1;
  const allowSender = roleMode !== "listenerOnly";
  const allowListener = roleMode !== "senderOnly";
  const initialSenderEnabled = allowSender ? (preset?.senderEnabled ?? false) : false;
  const initialStreamId = preset?.streamId ?? "";
  const initialListenerEnabled = allowListener ? (preset?.listenerEnabled ?? false) : false;
  const initialListenerStreams = preset?.listenerStreamIds ?? [];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);

  // Step 1 — Basics
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState(preset?.domain ?? "");
  const [evidence, setEvidence] = useState<"trust" | "verifier" | "hybrid">(
    preset?.evidence ?? "trust"
  );

  // Step 2 — Sender
  const [senderEnabled, setSenderEnabled] = useState(
    roleMode === "senderOnly" ? true : initialSenderEnabled
  );
  const [streamId, setStreamId] = useState(initialStreamId);
  const [streamDropdownOpen, setStreamDropdownOpen] = useState(false);
  const [agentPubkey, setAgentPubkey] = useState("");
  const [agentSecretKey, setAgentSecretKey] = useState("");

  // Step 3 — Listener
  const [listenerEnabled, setListenerEnabled] = useState(
    roleMode === "listenerOnly" ? true : initialListenerEnabled
  );
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<string[]>(initialListenerStreams);

  // Step 4 — Deploy
  const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);

  // Validation
  const [validationError, setValidationError] = useState<string | null>(null);

  function computeRole(): "maker" | "listener" | "both" {
    if (roleMode === "senderOnly") return "maker";
    if (roleMode === "listenerOnly") return "listener";
    if (senderEnabled && listenerEnabled) return "both";
    if (senderEnabled) return "maker";
    return "listener";
  }

  function generateKeypair() {
    const kp = Keypair.generate();
    setAgentPubkey(kp.publicKey.toBase58());
    setAgentSecretKey(JSON.stringify(Array.from(kp.secretKey)));
  }

  function toggleSubscription(streamId: string) {
    setSelectedSubscriptions((prev) =>
      prev.includes(streamId) ? prev.filter((s) => s !== streamId) : [...prev, streamId]
    );
  }

  // Navigation
  function nextStep(from: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
    if (from === 1) {
      if (allowSender) return 2;
      if (allowListener) return 3;
      return 4;
    }
    if (from === 2) {
      if (allowListener) return 3;
      return 4;
    }
    return 4;
  }

  function prevStep(from: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
    if (from === 4) {
      if (allowListener) return 3;
      if (allowSender) return 2;
      return 1;
    }
    if (from === 3) {
      if (allowSender) return 2;
      return 1;
    }
    return 1;
  }

  function goToStep2() {
    if (!name.trim()) {
      setValidationError("Agent name is required.");
      return;
    }
    if (basicsMode === "full" && !domain.trim()) {
      setValidationError("Agent domain is required.");
      return;
    }
    setValidationError(null);
    setStep(nextStep(1));
  }

  function goToStep3() {
    if (senderEnabled && (!streamId.trim() || !agentPubkey.trim())) {
      setValidationError("Stream ID and agent public key are required for sender agents.");
      return;
    }
    setValidationError(null);
    setStep(nextStep(2));
  }

  function goToStep4() {
    if (!senderEnabled && !listenerEnabled) {
      setValidationError("Agent must be configured as a sender, listener, or both.");
      return;
    }
    if (listenerEnabled && selectedSubscriptions.length === 0) {
      setValidationError("Select at least one stream to listen to.");
      return;
    }
    setValidationError(null);
    setStep(4);
  }

  // Deploy
  async function deploy() {
    if (!publicKey) return;
    setDeploying(true);
    setDeployDone(false);

    const fallbackDomain =
      domain.trim() ||
      preset?.domain ||
      streamCatalog[0]?.domain ||
      "listener";
    const fallbackEvidence = evidence ?? preset?.evidence ?? "trust";

    const steps: DeployStep[] = [{ label: "Register agent", status: "pending" }];
    if (senderEnabled) {
      steps.push({ label: "Grant publish permission", status: "pending" });
    }
    if (listenerEnabled && selectedSubscriptions.length > 0) {
      steps.push({ label: "Link subscriptions", status: "pending" });
    }
    setDeploySteps([...steps]);

    let stepIdx = 0;

    // Step: Create agent
    function updateStep(idx: number, patch: Partial<DeployStep>) {
      setDeploySteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    }

    updateStep(stepIdx, { status: "active" });
    let createdAgentId: string | undefined;
    try {
      const res = await sdkCreateAgent<{ agent: { id: string } }>({
        ownerWallet: walletAddr,
        agentPubkey: agentPubkey.trim() || undefined,
        name: name.trim(),
        domain: fallbackDomain,
        description: description.trim() || undefined,
        role: computeRole(),
        streamId: senderEnabled ? streamId.trim() : undefined,
        evidence: fallbackEvidence,
      });
      createdAgentId = res.agent.id;
      updateStep(stepIdx, { status: "done" });
    } catch (err: any) {
      updateStep(stepIdx, { status: "error", error: err?.message ?? "Failed to create agent" });
      setDeploying(false);
      return;
    }

    stepIdx++;

    // Step: Grant publisher (on-chain)
    if (senderEnabled) {
      updateStep(stepIdx, { status: "active" });
      try {
        const programId = resolveStreamRegistryId();
        const streamPda = await deriveStreamPda(programId, streamId.trim());
        const ix = await buildGrantPublisherInstruction({
          programId,
          stream: streamPda,
          authority: publicKey,
          agent: new PublicKey(agentPubkey.trim()),
        });
        const tx = new Transaction().add(ix);
        tx.feePayer = publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        await sendTransaction(tx, connection);
        updateStep(stepIdx, { status: "done" });
      } catch (err: any) {
        updateStep(stepIdx, {
          status: "error",
          error: err?.message ?? "Failed to grant publish. You can do this later from Your Agents.",
        });
      }
      stepIdx++;
    }

    // Step: Link subscriptions
    if (listenerEnabled && selectedSubscriptions.length > 0 && createdAgentId) {
      updateStep(stepIdx, { status: "active" });
      const errors: string[] = [];
      for (const subStreamId of selectedSubscriptions) {
        const option = ownedSubscriptionOptions.find((o) => o.streamId === subStreamId);
        if (!option) continue;
        try {
          await sdkCreateAgentSubscription({
            ownerWallet: walletAddr,
            agentId: createdAgentId,
            streamId: option.streamId,
            tierId: option.tierId,
            pricingType: option.pricingType,
            evidenceLevel: option.evidenceLevel,
            visibility: option.visibility,
          });
        } catch (err: any) {
          errors.push(`${option.streamName}: ${err?.message ?? "failed"}`);
        }
      }
      if (errors.length > 0) {
        updateStep(stepIdx, { status: "error", error: errors.join("; ") });
      } else {
        updateStep(stepIdx, { status: "done" });
      }
    }

    setDeploying(false);
    setDeployDone(true);
    onAgentCreated();
  }

  function reset() {
    setStep(initialStep);
    setName("");
    setDescription("");
    setDomain(preset?.domain ?? "");
    setEvidence(preset?.evidence ?? "trust");
    setSenderEnabled(roleMode === "senderOnly" ? true : initialSenderEnabled);
    setStreamId(initialStreamId);
    setStreamDropdownOpen(false);
    setAgentPubkey("");
    setAgentSecretKey("");
    setListenerEnabled(roleMode === "listenerOnly" ? true : initialListenerEnabled);
    setSelectedSubscriptions(initialListenerStreams);
    setDeploySteps([]);
    setDeploying(false);
    setDeployDone(false);
    setValidationError(null);
  }

  const STEPS = [
    { n: 1, label: "Basics", show: true },
    { n: 2, label: "Sender", show: allowSender },
    { n: 3, label: "Listener", show: allowListener },
    { n: 4, label: "Deploy", show: true },
  ] as const;
  const visibleSteps = STEPS.filter((s) => s.show);

  return (
    <div
      className="x-rail-module"
      style={{ border: 0, background: "transparent", padding: 0, marginBottom: 24 }}
    >
      <h3 className="x-rail-heading">{heading}</h3>

      {/* Step bar */}
      <div className="step-bar">
        {visibleSteps.map(({ n, label }, idx) => (
          <div
            key={n}
            className={`step-item${step > n ? " step-item--done" : ""}${step === n ? " step-item--active" : ""}`}
          >
            <div className="step-dot">{step > n ? "\u2713" : idx + 1}</div>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Basics */}
      {step === 1 && (
        <div className="step-content">
          <h3>Agent Basics</h3>
          <p className="subtext">
            {basicsMode === "full"
              ? "Name, domain, and evidence level for your agent."
              : "Name your agent."}
          </p>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
            style={{ marginBottom: 8 }}
          />
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            style={{ marginBottom: 8 }}
          />
          {basicsMode === "full" && (
            <>
              <input
                className="input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Domain (e.g. pricing)"
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                {(["trust", "verifier", "hybrid"] as const).map((ev) => (
                  <button
                    key={ev}
                    className={`button ${evidence === ev ? "primary" : "ghost"}`}
                    onClick={() => setEvidence(ev)}
                    style={{ flex: 1, fontSize: 11, padding: "6px 4px" }}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </>
          )}
          {validationError && (
            <p className="subtext" style={{ color: "var(--accent)", marginTop: 4 }}>
              {validationError}
            </p>
          )}
          <div className="step-actions">
            <button className="button primary" onClick={goToStep2}>
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Sender */}
      {step === 2 && allowSender && (
        <div className="step-content">
          <h3>Sender Configuration</h3>
          <p className="subtext">Configure this agent to publish signals to a stream.</p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={senderEnabled}
              onChange={(e) => setSenderEnabled(e.target.checked)}
              disabled={roleMode === "senderOnly"}
            />
            <span>This agent will publish signals</span>
          </label>
          {senderEnabled && (
            <>
              {lockStreamId ? (
                <div className="stream-locked">
                  <div>
                    <strong>{streamCatalog.find((s) => s.id === streamId)?.name ?? streamId}</strong>
                    <span className="subtext">{streamId}</span>
                  </div>
                  <span className="badge">Selected</span>
                </div>
              ) : (
                <div className={`signal-activity${streamDropdownOpen ? " signal-activity--open" : ""}`} style={{ marginBottom: 8 }}>
                  <button
                    className="signal-activity__toggle"
                    type="button"
                    onClick={() => setStreamDropdownOpen((p) => !p)}
                  >
                    <span>{streamId ? streamCatalog.find((s) => s.id === streamId)?.name ?? streamId : "Select a stream"}</span>
                    <span className="signal-activity__meta">
                      {streamId ? streamId : ""}
                    </span>
                    <span className="signal-activity__chev">{streamDropdownOpen ? "\u25B4" : "\u25BE"}</span>
                  </button>
                  {streamDropdownOpen && (
                    <div className="signal-activity__list">
                      {streamCatalog.filter((s) => s.authority === walletAddr).length === 0 && (
                        <div className="signal-activity__empty">No streams owned by this wallet.</div>
                      )}
                      {streamCatalog
                        .filter((s) => s.authority === walletAddr)
                        .map((stream) => (
                          <button
                            key={stream.id}
                            type="button"
                            className="signal-activity__item"
                            style={{
                              cursor: "pointer",
                              background: streamId === stream.id ? "rgba(255,255,255,0.08)" : "transparent",
                              border: "none",
                              borderRadius: 8,
                              padding: "8px 4px",
                              width: "100%",
                              textAlign: "left",
                            }}
                            onClick={() => { setStreamId(stream.id); setStreamDropdownOpen(false); }}
                          >
                            <span className="signal-activity__time">{stream.name}</span>
                            <span className="signal-activity__meta">{stream.id}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
                <input
                  className="input"
                  value={agentPubkey}
                  onChange={(e) => setAgentPubkey(e.target.value)}
                  placeholder="Agent public key"
                  style={{ flex: 1, margin: 0 }}
                />
                <button
                  className="button ghost"
                  type="button"
                  onClick={generateKeypair}
                  style={{ whiteSpace: "nowrap", height: "auto" }}
                >
                  Generate
                </button>
              </div>
              {agentSecretKey && (
                <>
                  <textarea
                    className="input"
                    value={agentSecretKey}
                    readOnly
                    rows={3}
                    style={{ marginBottom: 4 }}
                  />
                  <p className="subtext" style={{ marginBottom: 8, color: "var(--accent)" }}>
                    Store this secret key safely. It will not be shown again.
                  </p>
                </>
              )}
            </>
          )}
          {validationError && (
            <p className="subtext" style={{ color: "var(--accent)", marginTop: 4 }}>
              {validationError}
            </p>
          )}
          <div className="step-actions">
            <button className="button ghost" onClick={() => { setValidationError(null); setStep(prevStep(2)); }}>
              &larr; Back
            </button>
            <button className="button primary" onClick={goToStep3}>
              {senderEnabled ? "Next \u2192" : "Skip \u2192"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Listener */}
      {step === 3 && allowListener && (
        <div className="step-content">
          <h3>Listener Configuration</h3>
          <p className="subtext">Configure this agent to listen to streams you are subscribed to.</p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={listenerEnabled}
              onChange={(e) => setListenerEnabled(e.target.checked)}
              disabled={roleMode === "listenerOnly"}
            />
            <span>This agent will listen to streams</span>
          </label>
          {listenerEnabled && (
            <>
              {ownedSubscriptionOptions.length > 0 ? (
                <div className="chip-row" style={{ marginBottom: 12 }}>
                  {ownedSubscriptionOptions.map((option) => (
                    <button
                      key={option.streamId}
                      className={`chip${selectedSubscriptions.includes(option.streamId) ? " chip--active" : ""}`}
                      onClick={() => toggleSubscription(option.streamId)}
                      type="button"
                    >
                      {option.streamName} &middot; {option.tierId}
                      {option.visibility ? ` \u00b7 ${option.visibility}` : ""}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="subtext" style={{ marginBottom: 12 }}>
                  You don&apos;t have any active subscriptions.{" "}
                  <a href="/profile/subscriptions" className="link">
                    Go to My Subscriptions
                  </a>{" "}
                  to subscribe to streams first.
                </p>
              )}
            </>
          )}
          {validationError && (
            <p className="subtext" style={{ color: "var(--accent)", marginTop: 4 }}>
              {validationError}
            </p>
          )}
          <div className="step-actions">
            <button className="button ghost" onClick={() => { setValidationError(null); setStep(prevStep(3)); }}>
              &larr; Back
            </button>
            <button className="button primary" onClick={goToStep4}>
              {listenerEnabled ? "Review \u2192" : "Skip \u2192"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Deploy */}
      {step === 4 && (
        <div className="step-content">
          <h3>Review &amp; Deploy</h3>
          <p className="subtext">Review your agent configuration before registering.</p>

          <div className="deploy-summary">
            <div className="deploy-summary-row">
              <span>Name</span>
              <strong>{name}</strong>
            </div>
            {description.trim() && (
              <div className="deploy-summary-row">
                <span>Description</span>
                <strong>{description}</strong>
              </div>
            )}
            {basicsMode === "full" && (
              <>
                <div className="deploy-summary-row">
                  <span>Domain</span>
                  <strong>{domain}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Evidence</span>
                  <strong>{evidence}</strong>
                </div>
              </>
            )}
            <div className="deploy-summary-row">
              <span>Role</span>
              <strong>
                {senderEnabled && listenerEnabled
                  ? "sender + listener"
                  : senderEnabled
                    ? "sender"
                    : "listener"}
              </strong>
            </div>
            {senderEnabled && (
              <>
                <div className="deploy-summary-row">
                  <span>Stream ID</span>
                  <strong>{streamId}</strong>
                </div>
                <div className="deploy-summary-row">
                  <span>Agent Key</span>
                  <strong style={{ wordBreak: "break-all", fontSize: 12 }}>
                    {agentPubkey.slice(0, 12)}...
                  </strong>
                </div>
              </>
            )}
            {listenerEnabled && selectedSubscriptions.length > 0 && (
              <div className="deploy-summary-row">
                <span>Listening to</span>
                <strong>
                  {selectedSubscriptions
                    .map((sid) => ownedSubscriptionOptions.find((o) => o.streamId === sid)?.streamName ?? sid)
                    .join(", ")}
                </strong>
              </div>
            )}
          </div>

          {/* Deploy progress */}
          {deploySteps.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {deploySteps.map((ds, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 18, textAlign: "center", fontSize: 14 }}>
                    {ds.status === "done" && "\u2713"}
                    {ds.status === "error" && "\u2717"}
                    {ds.status === "active" && "\u25CF"}
                    {ds.status === "pending" && "\u25CB"}
                  </span>
                  <span style={{ flex: 1 }}>
                    {ds.label}
                    {ds.error && (
                      <span className="subtext" style={{ display: "block", color: "var(--accent)" }}>
                        {ds.error}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {deployDone && (
            <div style={{ marginTop: 12 }}>
              <p className="subtext" style={{ color: "var(--accent-2)" }}>
                Agent registered successfully.
              </p>
              <button className="button ghost" onClick={reset} style={{ marginTop: 8 }}>
                Register another agent
              </button>
            </div>
          )}

          {!deployDone && (
            <div className="step-actions">
              <button
                className="button ghost"
                onClick={() => { setValidationError(null); setStep(prevStep(4)); }}
                disabled={deploying}
              >
                &larr; Back
              </button>
              <button
                className="button primary"
                onClick={deploy}
                disabled={deploying || !publicKey}
              >
                {deploying ? "Deploying\u2026" : "Deploy Agent"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
