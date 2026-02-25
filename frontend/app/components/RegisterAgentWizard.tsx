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
import { toast } from "../lib/toast";

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
  const allowPublisher = roleMode !== "listenerOnly";
  const allowListener = roleMode !== "senderOnly";
  const initialStreamId = preset?.streamId ?? "";
  const initialListenerStreams = preset?.listenerStreamIds ?? [];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);

  // Step 1 — Basics
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState(preset?.domain ?? "");

  // Step 2 — Publisher
  const [streamId, setStreamId] = useState(initialStreamId);
  const [streamDropdownOpen, setStreamDropdownOpen] = useState(false);
  const [listenerDropdownOpen, setListenerDropdownOpen] = useState(false);
  const [agentPubkey, setAgentPubkey] = useState("");
  const [agentSecretKey, setAgentSecretKey] = useState("");

  // Step 3 — Listener
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<string[]>(initialListenerStreams);

  // Step 4 — Deploy
  const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);

  // Validation
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedStream = streamCatalog.find((s) => s.id === streamId);
  const selectedListenerOptions = ownedSubscriptionOptions.filter((option) =>
    selectedSubscriptions.includes(option.streamId)
  );
  const listenerLabel =
    selectedListenerOptions.length === 0
      ? "Select subscriptions"
      : selectedListenerOptions.length === 1
        ? `${selectedListenerOptions[0].streamName} (${selectedListenerOptions[0].streamId})`
        : `${selectedListenerOptions.length} subscriptions selected`;

  const publisherInputsFilled = streamId.trim().length > 0 || agentPubkey.trim().length > 0;
  const publisherEnabled = roleMode === "senderOnly" ? true : publisherInputsFilled;
  const listenerEnabled = roleMode === "listenerOnly" ? true : selectedSubscriptions.length > 0;

  function computeRole(): "maker" | "listener" | "both" {
    if (roleMode === "senderOnly") return "maker";
    if (roleMode === "listenerOnly") return "listener";
    if (publisherEnabled && listenerEnabled) return "both";
    if (publisherEnabled) return "maker";
    return "listener";
  }

  function generateKeypair() {
    const kp = Keypair.generate();
    setAgentPubkey(kp.publicKey.toBase58());
    setAgentSecretKey(JSON.stringify(Array.from(kp.secretKey)));
  }

  function clearKeypair() {
    setAgentPubkey("");
    setAgentSecretKey("");
  }

  function toggleSubscription(streamId: string) {
    setSelectedSubscriptions((prev) =>
      prev.includes(streamId) ? prev.filter((s) => s !== streamId) : [...prev, streamId]
    );
  }

  // Navigation
  function nextStep(from: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
    if (from === 1) {
      if (allowPublisher) return 2;
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
      if (allowPublisher) return 2;
      return 1;
    }
    if (from === 3) {
      if (allowPublisher) return 2;
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
    const hasStream = streamId.trim().length > 0;
    const hasKey = agentPubkey.trim().length > 0;
    if (roleMode === "senderOnly" || hasStream || hasKey) {
      if (!hasStream || !hasKey) {
        setValidationError("Select a stream and provide an agent public key to publish.");
        return;
      }
    }
    setValidationError(null);
    setStep(nextStep(2));
  }

  function goToStep4() {
    if (!publisherEnabled && !listenerEnabled) {
      setValidationError("Agent must be configured as a publisher, listener, or both.");
      return;
    }
    if (roleMode === "listenerOnly" && selectedSubscriptions.length === 0) {
      setValidationError("Select at least one stream to listen to.");
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
    const fallbackEvidence: "trust" | "verifier" | "hybrid" = "trust";

    const steps: DeployStep[] = [{ label: "Register agent", status: "pending" }];
    if (publisherEnabled) {
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
        streamId: publisherEnabled ? streamId.trim() : undefined,
        evidence: fallbackEvidence,
      });
      createdAgentId = res.agent.id;
      updateStep(stepIdx, { status: "done" });
    } catch (err: any) {
      updateStep(stepIdx, { status: "error", error: err?.message ?? "Failed to create agent" });
      toast(err?.message ?? "Failed to create agent", "error");
      setDeploying(false);
      return;
    }

    stepIdx++;

    // Step: Grant publisher (on-chain)
    if (publisherEnabled) {
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
        const msg = err?.message ?? "Failed to grant publish. You can do this later from Your Agents.";
        updateStep(stepIdx, { status: "error", error: msg });
        toast(msg, "error");
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
        toast(errors.join("; "), "error");
      } else {
        updateStep(stepIdx, { status: "done" });
      }
    }

    setDeploying(false);
    setDeployDone(true);
    setTimeout(() => {
      onAgentCreated();
    }, 2000);
  }

  function reset() {
    setStep(initialStep);
    setName("");
    setDescription("");
    setDomain(preset?.domain ?? "");
    setStreamId(initialStreamId);
    setStreamDropdownOpen(false);
    setListenerDropdownOpen(false);
    setAgentPubkey("");
    setAgentSecretKey("");
    setSelectedSubscriptions(initialListenerStreams);
    setDeploySteps([]);
    setDeploying(false);
    setDeployDone(false);
    setValidationError(null);
  }

  function handleStepClick(target: 1 | 2 | 3 | 4) {
    if (target > step) return;
    setValidationError(null);
    setStep(target);
  }

  const STEPS = [
    { n: 1, label: "Basics", show: true },
    { n: 2, label: "Publisher", show: allowPublisher },
    { n: 3, label: "Listener", show: allowListener },
    { n: 4, label: "Deploy", show: true },
  ] as const;
  const visibleSteps = STEPS.filter((s) => s.show);

  return (
    <div
      className="x-rail-module"
      style={{ border: 0, background: "transparent", padding: 0, marginBottom: 24 }}
    >
      <h3 className="x-rail-heading agent-wizard-heading">{heading}</h3>

      <div className="agent-wizard">
        <div className="agent-wizard-steps">
          <div className="step-bar step-bar--vertical">
            {visibleSteps.map(({ n, label }, idx) => (
              <button
                key={n}
                type="button"
                className={`step-item${step > n ? " step-item--done" : ""}${step === n ? " step-item--active" : ""}`}
                onClick={() => handleStepClick(n)}
                disabled={n > step}
              >
                <div className="step-dot">{step > n ? "\u2713" : idx + 1}</div>
                <span className="step-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="agent-wizard-body">
          {/* Step 1: Basics */}
      {step === 1 && (
        <div className="step-content">
          <h3>Agent Basics</h3>
          <p className="subtext">
            {basicsMode === "full"
              ? "Name and domain for your agent."
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

          {/* Step 2: Publisher */}
      {step === 2 && allowPublisher && (
            <div className="step-content">
          <h3>Publisher Configuration</h3>
          <p className="subtext">Configure this agent to publish signals to a stream.</p>
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
            <button
              className="button ghost"
              type="button"
              onClick={clearKeypair}
              disabled={!agentPubkey && !agentSecretKey}
              style={{ whiteSpace: "nowrap", height: "auto" }}
            >
              Clear
            </button>
          </div>
          {lockStreamId ? (
            <div className="stream-locked">
              <div>
                <strong>{streamCatalog.find((s) => s.id === streamId)?.name ?? streamId}</strong>
                <span className="subtext">{streamId}</span>
              </div>
              <span className="badge">Selected</span>
            </div>
          ) : (
            <div className={`signal-activity signal-activity--dropdown${streamDropdownOpen ? " signal-activity--open" : ""}`} style={{ marginBottom: 8 }}>
              <button
                className="signal-activity__toggle signal-activity__toggle--input"
                type="button"
                onClick={() => setStreamDropdownOpen((p) => !p)}
              >
                <span className="signal-activity__label">
                  {streamId ? (
                    <>
                      <span className="signal-activity__label-name">{selectedStream?.name ?? streamId}</span>
                      <span className="signal-activity__label-meta"> ({streamId})</span>
                    </>
                  ) : (
                    "Select a stream"
                  )}
                </span>
                <span className="signal-activity__chev">{streamDropdownOpen ? "\u25B4" : "\u25BE"}</span>
              </button>
              {streamDropdownOpen && (
                <div className="signal-activity__list">
                  {streamId && (
                    <button
                      type="button"
                      className="signal-activity__item"
                      style={{
                        cursor: "pointer",
                        background: "rgba(255,255,255,0.06)",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 4px",
                        width: "100%",
                        textAlign: "left",
                      }}
                      onClick={() => { setStreamId(""); setStreamDropdownOpen(false); }}
                    >
                      <span className="signal-activity__time">Clear selection</span>
                    </button>
                  )}
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
              {publisherEnabled || roleMode === "senderOnly" ? "Next \u2192" : "Skip \u2192"}
            </button>
          </div>
            </div>
          )}

          {/* Step 3: Listener */}
      {step === 3 && allowListener && (
            <div className="step-content">
          <h3>Listener Configuration</h3>
          <p className="subtext">Configure this agent to listen to streams you are subscribed to.</p>
          {ownedSubscriptionOptions.length > 0 ? (
            <div className={`signal-activity signal-activity--dropdown${listenerDropdownOpen ? " signal-activity--open" : ""}`} style={{ marginBottom: 8 }}>
              <button
                className="signal-activity__toggle signal-activity__toggle--input"
                type="button"
                onClick={() => setListenerDropdownOpen((p) => !p)}
              >
                <span className="signal-activity__label">{listenerLabel}</span>
                <span className="signal-activity__chev">{listenerDropdownOpen ? "\u25B4" : "\u25BE"}</span>
              </button>
              {listenerDropdownOpen && (
                <div className="signal-activity__list">
                  {selectedSubscriptions.length > 0 && (
                    <button
                      type="button"
                      className="signal-activity__item signal-activity__item--clear"
                      style={{
                        cursor: "pointer",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 4px",
                        width: "100%",
                        textAlign: "left",
                      }}
                      onClick={() => { setSelectedSubscriptions([]); }}
                    >
                      <span className="signal-activity__time">Clear selection</span>
                    </button>
                  )}
                  {ownedSubscriptionOptions.map((option) => {
                    const active = selectedSubscriptions.includes(option.streamId);
                    return (
                      <button
                        key={option.streamId}
                        type="button"
                        className="signal-activity__item"
                        style={{
                          cursor: "pointer",
                          background: active ? "rgba(255,255,255,0.08)" : "transparent",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 4px",
                          width: "100%",
                          textAlign: "left",
                        }}
                        onClick={() => toggleSubscription(option.streamId)}
                      >
                        <span className="signal-activity__time">{option.streamName}</span>
                        <span className="signal-activity__meta">
                          {option.tierId}
                          {option.visibility ? ` · ${option.visibility}` : ""}
                          {active ? " ✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
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
              {listenerEnabled || roleMode === "listenerOnly" ? "Review \u2192" : "Skip \u2192"}
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
              </>
            )}
            <div className="deploy-summary-row">
              <span>Role</span>
              <strong>
                {publisherEnabled && listenerEnabled
                  ? "publisher + listener"
                  : publisherEnabled
                    ? "publisher"
                    : "listener"}
              </strong>
            </div>
            {publisherEnabled && (
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
                  </span>
                </div>
              ))}
            </div>
          )}

          {deployDone && (
            <div style={{ marginTop: 12 }}>
              <p className="subtext" style={{ color: "var(--accent-2)" }}>
                Agent registered successfully. Redirecting to My Agents…
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
      </div>
    </div>
  );
}
