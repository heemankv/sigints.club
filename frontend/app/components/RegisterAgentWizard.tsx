"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createAgent as sdkCreateAgent,
  createAgentSubscription as sdkCreateAgentSubscription,
} from "../lib/sdkBackend";
import {
  buildGrantPublisherTransaction,
  deriveStreamPda,
  hasRegisteredSubscriptionKey,
  resolveProgramId,
  resolveStreamRegistryId,
  resolveStreamPubkey,
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
  const [agentPubkeyError, setAgentPubkeyError] = useState<string | null>(null);
  const [agentSecretKey, setAgentSecretKey] = useState("");
  const [subscriptionKeyStatus, setSubscriptionKeyStatus] = useState<Record<string, boolean | null>>({});

  // Step 3 — Listener
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<string[]>(initialListenerStreams);

  // Step 4 — Deploy
  const [deployPhase, setDeployPhase] = useState<"idle" | "agent" | "grant" | "link" | "done">("idle");
  const [deployLoading, setDeployLoading] = useState(false);
  const [agentDone, setAgentDone] = useState(false);
  const [grantDone, setGrantDone] = useState(false);
  const [linkDone, setLinkDone] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
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

  function isValidPubkey(key: string): boolean {
    try {
      new PublicKey(key);
      return true;
    } catch {
      return false;
    }
  }

  function handleAgentPubkeyChange(value: string) {
    setAgentPubkey(value);
    if (!value.trim()) {
      setAgentPubkeyError(null);
    } else if (!isValidPubkey(value.trim())) {
      setAgentPubkeyError("Invalid public key — must be a valid base58 Solana key.");
    } else {
      setAgentPubkeyError(null);
    }
  }

  function generateKeypair() {
    const kp = Keypair.generate();
    setAgentPubkey(kp.publicKey.toBase58());
    setAgentPubkeyError(null);
    setAgentSecretKey(JSON.stringify(Array.from(kp.secretKey)));
  }

  function clearKeypair() {
    setAgentPubkey("");
    setAgentPubkeyError(null);
    setAgentSecretKey("");
  }

  function toggleSubscription(streamId: string) {
    const option = ownedSubscriptionOptions.find((item) => item.streamId === streamId);
    const requiresKey = option?.visibility === "private";
    const keyReady = subscriptionKeyStatus[streamId];
    if (requiresKey && keyReady === false) {
      toast("Register a subscription encryption key before linking a private stream.", "warn");
      return;
    }
    setSelectedSubscriptions((prev) =>
      prev.includes(streamId) ? prev.filter((s) => s !== streamId) : [...prev, streamId]
    );
  }

  useEffect(() => {
    let active = true;
    if (!publicKey || ownedSubscriptionOptions.length === 0) {
      setSubscriptionKeyStatus({});
      return undefined;
    }

    async function loadKeyStatus() {
      const programId = resolveProgramId();
      const walletPubkey = publicKey;
      if (!walletPubkey) return;
      const updates: Record<string, boolean | null> = {};
      for (const option of ownedSubscriptionOptions) {
        if (option.visibility === "public") {
          updates[option.streamId] = true;
          continue;
        }
        if (!option.streamOnchainAddress) {
          updates[option.streamId] = false;
          continue;
        }
        try {
          const streamPubkey = resolveStreamPubkey(option.streamOnchainAddress);
          const registered = await hasRegisteredSubscriptionKey(connection, programId, streamPubkey, walletPubkey);
          updates[option.streamId] = registered;
        } catch {
          updates[option.streamId] = false;
        }
      }
      if (!active) return;
      setSubscriptionKeyStatus(updates);
    }

    void loadKeyStatus();
    return () => {
      active = false;
    };
  }, [connection, publicKey, ownedSubscriptionOptions]);

  useEffect(() => {
    if (!selectedSubscriptions.length) return;
    if (!Object.keys(subscriptionKeyStatus).length) return;
    const invalidSelections = selectedSubscriptions.filter((streamId) => {
      const option = ownedSubscriptionOptions.find((item) => item.streamId === streamId);
      if (!option) return false;
      if (option.visibility !== "private") return false;
      return subscriptionKeyStatus[streamId] === false;
    });
    if (invalidSelections.length === 0) return;
    setSelectedSubscriptions((prev) => prev.filter((id) => !invalidSelections.includes(id)));
    toast("Register a subscription encryption key for private streams before linking a listener agent.", "warn");
  }, [ownedSubscriptionOptions, selectedSubscriptions, subscriptionKeyStatus]);

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
      if (!isValidPubkey(agentPubkey.trim())) {
        setValidationError("Agent public key is not a valid Solana key.");
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
    if (listenerEnabled && selectedSubscriptions.length > 0) {
      const blocked = selectedSubscriptions.find((streamId) => {
        const option = ownedSubscriptionOptions.find((item) => item.streamId === streamId);
        if (!option || option.visibility !== "private") return false;
        return subscriptionKeyStatus[streamId] !== true;
      });
      if (blocked) {
        setValidationError("Register a subscription encryption key before linking private streams.");
        return;
      }
    }
    setValidationError(null);
    setStep(4);
  }

  // Deploy — determine which phase comes after a given phase
  function nextPhase(current: "agent" | "grant" | "link"): "idle" | "agent" | "grant" | "link" | "done" {
    if (current === "agent") {
      if (publisherEnabled) return "grant";
      if (listenerEnabled && selectedSubscriptions.length > 0) return "link";
      return "done";
    }
    if (current === "grant") {
      if (listenerEnabled && selectedSubscriptions.length > 0) return "link";
      return "done";
    }
    return "done";
  }

  function finishPhase(current: "agent" | "grant" | "link") {
    const next = nextPhase(current);
    setDeployPhase(next);
    setDeployLoading(false);
    if (next === "done") {
      setDeployDone(true);
      toast("Agent registered successfully.", "success");
      onAgentCreated();
    }
  }

  async function deployAgent() {
    if (!publicKey) return;
    setDeployPhase("agent");
    setDeployLoading(true);

    const fallbackDomain =
      domain.trim() ||
      preset?.domain ||
      streamCatalog[0]?.domain ||
      "listener";
    const fallbackEvidence: "trust" | "verifier" | "hybrid" = "trust";

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
      setCreatedAgentId(res.agent.id);
      setAgentDone(true);
      finishPhase("agent");
    } catch (err: any) {
      toast(err?.message ?? "Failed to create agent", "error");
      setDeployLoading(false);
    }
  }

  async function deployGrant() {
    if (!publicKey) return;
    setDeployPhase("grant");
    setDeployLoading(true);
    try {
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, streamId.trim());
      const { transaction } = await buildGrantPublisherTransaction({
        connection,
        authority: publicKey,
        stream: streamPda,
        agent: agentPubkey.trim(),
      });
      await sendTransaction(transaction, connection);
      setGrantDone(true);
      finishPhase("grant");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to grant publish. You can retry or do this later from Your Agents.";
      toast(msg, "error");
      setDeployLoading(false);
    }
  }

  async function deployLink() {
    if (!createdAgentId) return;
    setDeployPhase("link");
    setDeployLoading(true);
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
      toast(errors.join("; "), "error");
      setDeployLoading(false);
      return;
    }
    setLinkDone(true);
    finishPhase("link");
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
    setAgentPubkeyError(null);
    setAgentSecretKey("");
    setSelectedSubscriptions(initialListenerStreams);
    setDeployPhase("idle");
    setDeployLoading(false);
    setAgentDone(false);
    setGrantDone(false);
    setLinkDone(false);
    setCreatedAgentId(null);
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
      style={{ border: 0, background: "transparent", padding: 0 }}
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
          <div className="md-field" style={{ marginBottom: 8 }}>
            <label className="md-label">Name</label>
            <input
              className="md-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
            />
          </div>
          <div className="md-field" style={{ marginBottom: 8 }}>
            <label className="md-label">Description</label>
            <textarea
              className="md-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
            />
          </div>
          {basicsMode === "full" && (
            <div className="md-field" style={{ marginBottom: 8 }}>
              <label className="md-label">Domain</label>
              <input
                className="md-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Domain (e.g. pricing)"
              />
            </div>
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
          <div className="md-field" style={{ marginBottom: 8 }}>
            <label className="md-label">Agent Public Key</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                className={`md-input${agentPubkeyError ? " md-input--error" : ""}`}
                value={agentPubkey}
                onChange={(e) => handleAgentPubkeyChange(e.target.value)}
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
            {agentPubkeyError && (
              <p className="md-field-error">{agentPubkeyError}</p>
            )}
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
              <div className="md-field" style={{ marginBottom: 4 }}>
                <label className="md-label">Agent Secret Key</label>
                <textarea
                  className="md-textarea"
                  value={agentSecretKey}
                  readOnly
                  rows={3}
                />
              </div>
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
                    const requiresKey = option.visibility === "private";
                    const keyReady = subscriptionKeyStatus[option.streamId];
                    const keyMissing = requiresKey && keyReady === false;
                    const isChecking = requiresKey && keyReady == null;
                    const isDisabled = keyMissing || isChecking;
                    return (
                      <button
                        key={option.streamId}
                        type="button"
                        className={`signal-activity__item${isDisabled ? " signal-activity__item--disabled" : ""}`}
                        style={{
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          background: active ? "rgba(255,255,255,0.08)" : "transparent",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 4px",
                          width: "100%",
                          textAlign: "left",
                        }}
                        onClick={() => {
                          if (isDisabled) {
                            if (keyMissing) {
                              toast(
                                "Register a subscription encryption key before linking a private stream.",
                                "warn"
                              );
                            } else {
                              toast("Checking subscription encryption key status...", "warn");
                            }
                            return;
                          }
                          toggleSubscription(option.streamId);
                        }}
                      >
                        <span className="signal-activity__time">{option.streamName}</span>
                        <span className="signal-activity__meta">
                          {option.tierId}
                          {option.visibility ? ` · ${option.visibility}` : ""}
                          {isChecking ? " · checking key…" : ""}
                          {keyMissing ? " · key missing" : ""}
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

          {/* Deploy pipeline */}
          <div className="deploy-pipeline">
            {deployPhase === "idle" && (
              <button className="button ghost" onClick={() => { setValidationError(null); setStep(prevStep(4)); }} style={{ marginRight: "auto" }}>
                &larr; Back
              </button>
            )}

            {/* Register Agent (always shown) */}
            <button
              className={`deploy-pipeline-btn${
                agentDone ? " deploy-pipeline-btn--done"
                : deployPhase === "agent" && deployLoading ? " deploy-pipeline-btn--loading"
                : (deployPhase === "idle" || deployPhase === "agent") && !agentDone ? " deploy-pipeline-btn--active"
                : ""
              }`}
              onClick={!agentDone && !deployLoading ? deployAgent : undefined}
              disabled={agentDone || deployLoading || !publicKey}
            >
              {agentDone ? "\u2713 Agent" : deployPhase === "agent" && deployLoading ? "Registering\u2026" : "Register Agent"}
            </button>

            {/* Grant Publish (conditional) */}
            {publisherEnabled && (
              <>
                <span className={`deploy-pipeline-arrow${agentDone ? " deploy-pipeline-arrow--active" : ""}`}>&rarr;</span>
                <button
                  className={`deploy-pipeline-btn${
                    grantDone ? " deploy-pipeline-btn--done"
                    : deployPhase === "grant" && deployLoading ? " deploy-pipeline-btn--loading"
                    : deployPhase === "grant" && !deployLoading ? " deploy-pipeline-btn--active"
                    : ""
                  }`}
                  onClick={agentDone && !grantDone && !deployLoading ? deployGrant : undefined}
                  disabled={!agentDone || grantDone || deployLoading}
                >
                  {grantDone ? "\u2713 Publish" : deployPhase === "grant" && deployLoading ? "Granting\u2026" : "Grant Publish"}
                </button>
              </>
            )}

            {/* Link Subscriptions (conditional) */}
            {listenerEnabled && selectedSubscriptions.length > 0 && (
              <>
                <span className={`deploy-pipeline-arrow${(publisherEnabled ? grantDone : agentDone) ? " deploy-pipeline-arrow--active" : ""}`}>&rarr;</span>
                <button
                  className={`deploy-pipeline-btn${
                    linkDone ? " deploy-pipeline-btn--done"
                    : deployPhase === "link" && deployLoading ? " deploy-pipeline-btn--loading"
                    : deployPhase === "link" && !deployLoading ? " deploy-pipeline-btn--active"
                    : ""
                  }`}
                  onClick={(publisherEnabled ? grantDone : agentDone) && !linkDone && !deployLoading ? deployLink : undefined}
                  disabled={!(publisherEnabled ? grantDone : agentDone) || linkDone || deployLoading}
                >
                  {linkDone ? "\u2713 Linked" : deployPhase === "link" && deployLoading ? "Linking\u2026" : "Link Subs"}
                </button>
              </>
            )}
          </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
