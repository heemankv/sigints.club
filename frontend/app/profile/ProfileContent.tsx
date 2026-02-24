"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams, readStreamsCache } from "../lib/api/streams";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../lib/api/subscriptions";
import {
  createAgent as sdkCreateAgent,
  createAgentSubscription as sdkCreateAgentSubscription,
  deleteAgentSubscription,
  updateUserProfile,
} from "../lib/sdkBackend";
import {
  fetchAgents,
  readAgentsCache,
  fetchAgentSubscriptions,
  readAgentSubsCache,
} from "../lib/api/agents";
import type { AgentProfile, AgentSubscription, StreamDetail, StreamTier } from "../lib/types";
import OwnedSubscriptionCard from "../components/OwnedSubscriptionCard";
import MyStreamsSection from "../components/MyStreamsSection";
import KeyManager from "../stream/[id]/KeyManager";
import { sha256Bytes } from "../lib/solana";
import { toHex } from "../lib/utils";
import LeftNav from "../components/LeftNav";
import { useUserProfile, type UserProfile } from "../lib/userProfile";

type OwnedSubscriptionOption = {
  streamId: string;
  streamName: string;
  tierId: string;
  pricingType: "subscription_unlimited";
  evidenceLevel: "trust" | "verifier";
  visibility?: "public" | "private";
};

export type ProfileTab = "subscriptions" | "streams" | "agents" | "actions";

export default function ProfileContent({ initialTab = "subscriptions" }: { initialTab?: ProfileTab }) {
  const { publicKey } = useWallet();
  const { profile, setProfile, followCounts, followCountsLoading } = useUserProfile();

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentSubscriptions, setAgentSubscriptions] = useState<AgentSubscription[]>([]);
  const [ownedSubscriptionOptions, setOwnedSubscriptionOptions] = useState<OwnedSubscriptionOption[]>([]);
  const [streamCatalog, setStreamCatalog] = useState<StreamDetail[]>([]);
  const [subscriptionCards, setSubscriptionCards] = useState<ComponentProps<typeof OwnedSubscriptionCard>[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [railStreams, setRailStreams] = useState<StreamDetail[]>([]);
  const [agentName, setAgentName] = useState("");
  const [agentDomain, setAgentDomain] = useState("");
  const [agentStreamId, setAgentStreamId] = useState("");
  const [agentRole, setAgentRole] = useState<"maker" | "listener">("listener");
  const [agentEvidence, setAgentEvidence] = useState<"trust" | "verifier" | "hybrid">("trust");
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [linkStatus, setLinkStatus] = useState<Record<string, string | null>>({});

  const activeTab = initialTab;
  const [actionsTab, setActionsTab] = useState<"editProfile" | "registerKey">("editProfile");

  const walletAddr = publicKey?.toBase58();
  const walletShort = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : null;

  useEffect(() => {
    async function loadRailStreams() {
      try {
        const cached = readStreamsCache();
        if (cached?.streams?.length) setRailStreams(cached.streams);
        const data = await fetchStreams({ includeTiers: true });
        setRailStreams(data.streams ?? []);
      } catch {
        setRailStreams([]);
      }
    }
    loadRailStreams();
  }, []);

  useEffect(() => {
    if (!walletAddr) return;
    void loadAgents();
    void loadAgentSubscriptions();
  }, [walletAddr]);

  useEffect(() => {
    if (!walletAddr) return;
    setEditDisplayName(profile?.displayName ?? "");
    setEditBio(profile?.bio ?? "");
  }, [walletAddr, profile?.displayName, profile?.bio]);


  useEffect(() => {
    if (agentRole !== "maker") {
      setAgentStreamId("");
    }
  }, [agentRole]);

  useEffect(() => {
    if (!walletAddr) return;
    const dirty =
      typeof window !== "undefined" && window.localStorage.getItem("subscriptionsDirty") === "1";
    void loadSubscriptions(dirty);
    if (dirty && typeof window !== "undefined") {
      window.localStorage.removeItem("subscriptionsDirty");
    }
  }, [walletAddr]);

  async function buildTierIndex(stream: StreamDetail): Promise<Map<string, StreamTier>> {
    const entries = await Promise.all(
      stream.tiers.map(async (tier) => {
        const hash = toHex(await sha256Bytes(tier.tierId));
        return [hash, tier] as const;
      })
    );
    return new Map(entries);
  }

  async function processSubscriptions(
    subs: import("../lib/types").OnChainSubscription[],
    streamList: StreamDetail[]
  ) {
    setStreamCatalog(streamList);

    const streamByPda = new Map<string, StreamDetail>();
    streamList.forEach((stream) => {
      if (stream.onchainAddress) {
        streamByPda.set(stream.onchainAddress, stream);
      }
    });

    const tierIndexCache = new Map<string, Map<string, StreamTier>>();
    const cards: ComponentProps<typeof OwnedSubscriptionCard>[] = [];
    const ownedOptions: OwnedSubscriptionOption[] = [];

    for (const sub of subs) {
      if (sub.status !== 0) continue;
      const streamMeta = streamByPda.get(sub.stream);
      let tierMatch: StreamTier | undefined;
      if (streamMeta) {
        let tierIndex = tierIndexCache.get(streamMeta.id);
        if (!tierIndex) {
          tierIndex = await buildTierIndex(streamMeta);
          tierIndexCache.set(streamMeta.id, tierIndex);
        }
        tierMatch = tierIndex.get(sub.tierIdHex);
      }

      const pricingType = sub.pricingType === 1 ? "subscription_unlimited" : String(sub.pricingType);
      const evidenceLevel =
        tierMatch?.evidenceLevel ?? (sub.evidenceLevel === 1 ? "verifier" : "trust");
      const price = tierMatch?.price ?? undefined;

      cards.push({
        streamName: streamMeta?.name ?? `Stream ${sub.stream.slice(0, 6)}…`,
        streamId: streamMeta?.id ?? sub.stream.slice(0, 10),
        tierLabel: tierMatch?.tierId ?? `tier-${sub.tierIdHex.slice(0, 6)}`,
        price,
        evidenceLevel,
        pricingType,
        expiresAt: sub.expiresAt,
        nftMint: sub.nftMint,
        description: streamMeta?.description,
      });

      if (streamMeta && tierMatch && pricingType === "subscription_unlimited") {
        ownedOptions.push({
          streamId: streamMeta.id,
          streamName: streamMeta.name,
          tierId: tierMatch.tierId,
          pricingType,
          evidenceLevel: evidenceLevel as "trust" | "verifier",
          visibility: streamMeta.visibility,
        });
      }
    }

    setSubscriptionCards(cards);
    setOwnedSubscriptionOptions(ownedOptions);
  }

  async function loadSubscriptions(forceFresh = false) {
    if (!walletAddr) return;
    setSubsLoading(true);
    setSubsError(null);

    // Show cached data instantly
    const cachedSubs = readSubscriptionsCache(walletAddr);
    const cachedStreams = readStreamsCache();
    if (cachedSubs?.subscriptions?.length && cachedStreams?.streams?.length) {
      await processSubscriptions(cachedSubs.subscriptions, cachedStreams.streams);
    }

    try {
      const [subsRes, streamsRes] = await Promise.all([
        fetchOnchainSubscriptions(walletAddr, { fresh: forceFresh }),
        fetchStreams({ includeTiers: true }),
      ]);
      await processSubscriptions(subsRes.subscriptions ?? [], streamsRes.streams ?? []);
    } catch (err: any) {
      setSubsError(err?.message ?? "Failed to load subscriptions.");
      if (!cachedSubs?.subscriptions?.length) {
        setSubscriptionCards([]);
        setOwnedSubscriptionOptions([]);
      }
    } finally {
      setSubsLoading(false);
    }
  }

  async function loadAgents() {
    if (!walletAddr) return;
    setAgentsLoading(true);
    const cached = readAgentsCache(walletAddr);
    if (cached?.length) setAgents(cached);
    try {
      const res = await fetchAgents({ owner: walletAddr });
      setAgents(res.agents ?? []);
    } catch {
      if (!cached?.length) setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }

  async function loadAgentSubscriptions() {
    if (!walletAddr) return;
    const cached = readAgentSubsCache(walletAddr);
    if (cached?.length) setAgentSubscriptions(cached);
    try {
      const res = await fetchAgentSubscriptions({ owner: walletAddr });
      setAgentSubscriptions(res.agentSubscriptions ?? []);
    } catch {
      if (!cached?.length) setAgentSubscriptions([]);
    }
  }

  async function createAgent() {
    if (!walletAddr) { setAgentStatus("Connect your wallet first."); return; }
    if (agentRole === "maker" && !agentStreamId.trim()) {
      setAgentStatus("Stream ID is required for sender agents.");
      return;
    }
    setAgentStatus(null);
    try {
      await sdkCreateAgent({
        ownerWallet: walletAddr,
        name: agentName,
        domain: agentDomain,
        description: "",
        role: agentRole,
        streamId: agentRole === "maker" ? agentStreamId.trim() : undefined,
        evidence: agentEvidence,
      });
      await loadAgents();
      setAgentName("");
      setAgentDomain("");
      setAgentStreamId("");
      setAgentStatus("Agent created.");
    } catch (err: any) {
      setAgentStatus(err.message ?? "Failed to create agent");
    }
  }

  async function linkSubscription(agentId: string) {
    if (!walletAddr) {
      setLinkStatus((prev) => ({ ...prev, [agentId]: "Connect your wallet first." }));
      return;
    }
    const streamId = linkSelections[agentId];
    if (!streamId) {
      setLinkStatus((prev) => ({ ...prev, [agentId]: "Select a subscription to link." }));
      return;
    }
    const option = ownedSubscriptionOptions.find((opt) => opt.streamId === streamId);
    if (!option) {
      setLinkStatus((prev) => ({ ...prev, [agentId]: "Subscription details not found." }));
      return;
    }
    setLinkStatus((prev) => ({ ...prev, [agentId]: null }));
    try {
      await sdkCreateAgentSubscription({
        ownerWallet: walletAddr,
        agentId,
        streamId: option.streamId,
        tierId: option.tierId,
        pricingType: option.pricingType,
        evidenceLevel: option.evidenceLevel,
        visibility: option.visibility,
      });
      await loadAgentSubscriptions();
      setLinkSelections((prev) => ({ ...prev, [agentId]: "" }));
      setLinkStatus((prev) => ({ ...prev, [agentId]: "Subscription linked." }));
    } catch (err: any) {
      setLinkStatus((prev) => ({ ...prev, [agentId]: err?.message ?? "Failed to link subscription." }));
    }
  }

  async function unlinkSubscription(agentId: string, subscriptionId: string) {
    try {
      await deleteAgentSubscription(subscriptionId);
      await loadAgentSubscriptions();
      setLinkStatus((prev) => ({ ...prev, [agentId]: "Subscription removed." }));
    } catch (err: any) {
      setLinkStatus((prev) => ({ ...prev, [agentId]: err?.message ?? "Failed to remove subscription." }));
    }
  }

  async function saveProfile() {
    if (!walletAddr) {
      setEditStatus("Connect your wallet first.");
      return;
    }
    setEditStatus(null);
    const nextDisplayName = editDisplayName;
    const nextBio = editBio;
    const payload: { displayName?: string; bio?: string } = {};
    if (nextDisplayName !== (profile?.displayName ?? "")) {
      payload.displayName = nextDisplayName;
    }
    if (nextBio !== (profile?.bio ?? "")) {
      payload.bio = nextBio;
    }
    if (Object.keys(payload).length === 0) {
      setEditStatus("No changes to save.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await updateUserProfile<{ user: UserProfile }>(walletAddr, payload);
      setProfile(res.user);
      setEditStatus("Profile updated.");
    } catch (err: any) {
      setEditStatus(err?.message ?? "Failed to update profile.");
    } finally {
      setEditSaving(false);
    }
  }

  const streamNameById = useMemo(
    () => new Map(streamCatalog.map((stream) => [stream.id, stream.name])),
    [streamCatalog]
  );
  const subscriptionsByAgent = useMemo(() => {
    const map = new Map<string, AgentSubscription[]>();
    agentSubscriptions.forEach((sub) => {
      const current = map.get(sub.agentId) ?? [];
      current.push(sub);
      map.set(sub.agentId, current);
    });
    return map;
  }, [agentSubscriptions]);
  const shouldGateAgentRegistration = !subsLoading && ownedSubscriptionOptions.length === 0;

  return (
    <section className="social-shell">

      <LeftNav />

      {/* ─── Center: profile content ─── */}
      <div className="social-main">
        {!publicKey ? (
          <div className="x-empty-state" style={{ padding: 48 }}>
            <p>Connect your wallet to view your profile.</p>
          </div>
        ) : (
          <>
            {/* Profile header */}
            <div className="profile-header">
              <div className="profile-header-avatar">
                {walletAddr![0].toUpperCase()}
              </div>
              <div>
                <div className="profile-header-name">
                  {profile?.displayName ?? walletShort}
                </div>
                {profile?.bio && (
                  <div className="x-trend-category" style={{ marginTop: 2 }}>{profile.bio}</div>
                )}
                {(followCountsLoading || followCounts) && (
                  <div className="profile-header-stats">
                    <span><strong>{followCounts?.following ?? "…"}</strong> Following</span>
                    <span><strong>{followCounts?.followers ?? "…"}</strong> Followers</span>
                  </div>
                )}
                <div className="profile-header-wallet">{walletAddr}</div>
              </div>
            </div>

            {activeTab === "subscriptions" && (
              <div className="profile-tab-content">
                {subscriptionCards.length > 0 && (
                  <div className="data-grid">
                    {subscriptionCards.map((card) => (
                      <OwnedSubscriptionCard key={`${card.streamId}:${card.tierLabel}`} {...card} />
                    ))}
                  </div>
                )}
                {subsLoading && subscriptionCards.length === 0 && (
                  <div className="stream-card-grid">
                    <div className="stream-card">
                      <div className="stream-card-row">
                        <div className="stream-card-identity">
                          <p className="subtext" style={{ margin: 0 }}>Loading subscriptions…</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {subsError && <p className="subtext">{subsError}</p>}
                {!subsLoading && !subsError && subscriptionCards.length === 0 && (
                  <div className="stream-card-grid">
                    <div className="stream-card">
                      <div className="stream-card-row">
                        <div className="stream-card-identity">
                          <p className="subtext" style={{ margin: 0 }}>No active subscriptions yet.</p>
                        </div>
                        <div className="stream-card-actions">
                          <button
                            className="button ghost"
                            onClick={() => void loadSubscriptions(true)}
                            disabled={subsLoading}
                          >
                            Refresh
                          </button>
                          <Link className="button ghost" href="/streams">
                            Explore Streams →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "streams" && (
              <div className="profile-tab-content">
                <MyStreamsSection />
              </div>
            )}

            {activeTab === "agents" && (
              <div className="profile-tab-content">
                <div
                  className="x-rail-module"
                  style={{ border: 0, background: "transparent", padding: 0, marginBottom: 24, position: "relative" }}
                >
                  <h3 className="x-rail-heading">Register Agent</h3>
                  <input
                    className="input"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Agent name"
                    style={{ marginBottom: 8 }}
                  />
                  <input
                    className="input"
                    value={agentDomain}
                    onChange={(e) => setAgentDomain(e.target.value)}
                    placeholder="Domain (e.g. pricing)"
                    style={{ marginBottom: 8 }}
                  />
                  {agentRole === "maker" && (
                    <>
                      <input
                        className="input"
                        value={agentStreamId}
                        onChange={(e) => setAgentStreamId(e.target.value)}
                        placeholder="Stream ID for sender agent"
                        list="agent-stream-suggestions"
                        style={{ marginBottom: 8 }}
                      />
                      <datalist id="agent-stream-suggestions">
                        {streamCatalog.map((stream) => (
                          <option key={stream.id} value={stream.id}>
                            {stream.name}
                          </option>
                        ))}
                      </datalist>
                    </>
                  )}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button
                      className={`button ${agentRole === "maker" ? "primary" : "ghost"}`}
                      onClick={() => setAgentRole("maker")}
                      style={{ flex: 1, fontSize: 13 }}
                    >
                      Sender
                    </button>
                    <button
                      className={`button ${agentRole === "listener" ? "primary" : "ghost"}`}
                      onClick={() => setAgentRole("listener")}
                      style={{ flex: 1, fontSize: 13 }}
                    >
                      Listener
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {(["trust", "verifier", "hybrid"] as const).map((ev) => (
                      <button
                        key={ev}
                        className={`button ${agentEvidence === ev ? "primary" : "ghost"}`}
                        onClick={() => setAgentEvidence(ev)}
                        style={{ flex: 1, fontSize: 11, padding: "6px 4px" }}
                      >
                        {ev}
                      </button>
                    ))}
                  </div>
                  <button className="button secondary" onClick={createAgent} style={{ width: "100%" }}>
                    Register Agent
                  </button>
                  {agentStatus && <p className="subtext" style={{ marginTop: 8 }}>{agentStatus}</p>}
                  {shouldGateAgentRegistration && (
                    <div className="agent-gate">
                      <div className="agent-gate__card">
                        <p>You need a subscription before a new agent can be added.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="x-rail-module" style={{ border: 0, background: "transparent", padding: 0 }}>
                  <h3 className="x-rail-heading">Your Agents</h3>
                  {agents.map((agent) => {
                      const linked = subscriptionsByAgent.get(agent.id) ?? [];
                      const linkedStreamIds = new Set(linked.map((sub) => sub.streamId));
                      const availableOptions = ownedSubscriptionOptions.filter(
                        (option) => !linkedStreamIds.has(option.streamId)
                      );
                      return (
                        <div className="x-trend-item" key={agent.id} style={{ paddingLeft: 0 }}>
                          <span className="x-trend-category">
                            {agent.domain} · {agent.role === "maker" ? "sender" : "listener"}
                          </span>
                          <strong className="x-trend-topic">{agent.name}</strong>
                          {agent.role === "maker" && agent.streamId && (
                            <span className="x-trend-meta">Stream: {agent.streamId}</span>
                          )}
                          <span className="x-trend-meta">{agent.evidence}</span>

                          <div style={{ marginTop: 10 }}>
                            <span className="subtext">Linked subscriptions</span>
                            {linked.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                                {linked.map((sub) => (
                                  <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className="chip">
                                      {(streamNameById.get(sub.streamId) ?? sub.streamId)} · {sub.tierId}
                                    </span>
                                    <button
                                      className="button ghost"
                                      onClick={() => void unlinkSubscription(agent.id, sub.id)}
                                      style={{ padding: "4px 10px", fontSize: 11 }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="subtext" style={{ marginTop: 6 }}>No subscriptions linked yet.</p>
                            )}
                          </div>

                          {agent.role === "listener" && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <select
                                  className="input"
                                  value={linkSelections[agent.id] ?? ""}
                                  onChange={(e) =>
                                    setLinkSelections((prev) => ({ ...prev, [agent.id]: e.target.value }))
                                  }
                                >
                                  <option value="">Select a subscription</option>
                                  {availableOptions.map((option) => (
                                    <option key={`${agent.id}-${option.streamId}`} value={option.streamId}>
                                      {option.streamName} · {option.tierId}{option.visibility ? ` · ${option.visibility}` : ""}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="button secondary"
                                  onClick={() => void linkSubscription(agent.id)}
                                  disabled={availableOptions.length === 0}
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  Link
                                </button>
                              </div>
                              {availableOptions.length === 0 && (
                                <p className="subtext" style={{ marginTop: 6 }}>
                                  No unlinked subscriptions available.
                                </p>
                              )}
                              {linkStatus[agent.id] && (
                                <p className="subtext" style={{ marginTop: 6 }}>{linkStatus[agent.id]}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {agentsLoading && agents.length === 0 && (
                    <p className="subtext">Loading agents…</p>
                  )}
                  {!agentsLoading && agents.length === 0 && (
                    <p className="subtext">No agents registered yet.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "actions" && (
              <div className="profile-tab-content">
                {/* Actions sub-tab bar */}
                <div className="maker-tabs">
                  <button
                    className={`maker-tab${actionsTab === "editProfile" ? " maker-tab--active" : ""}`}
                    onClick={() => setActionsTab("editProfile")}
                  >
                    Edit Profile
                  </button>
                  <button
                    className={`maker-tab${actionsTab === "registerKey" ? " maker-tab--active" : ""}`}
                    onClick={() => setActionsTab("registerKey")}
                  >
                    Register Key
                  </button>
                </div>

                {actionsTab === "editProfile" && (
                  <div className="x-rail-module" style={{ border: 0, background: "transparent", padding: 0 }}>
                    <input
                      className="input"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="Username"
                      style={{ marginBottom: 8 }}
                    />
                    <textarea
                      className="input"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="Bio"
                      rows={3}
                      style={{ resize: "vertical", marginBottom: 10 }}
                    />
                    <button
                      className="button secondary"
                      onClick={saveProfile}
                      disabled={editSaving}
                      style={{ width: "100%" }}
                    >
                      {editSaving ? "Saving..." : "Save Profile"}
                    </button>
                    {editStatus && <p className="subtext" style={{ marginTop: 8 }}>{editStatus}</p>}
                  </div>
                )}

                {actionsTab === "registerKey" && (
                  <KeyManager variant="plain" />
                )}


              </div>
            )}
          </>
        )}
      </div>

      <aside className="social-rail">
        <div className="x-rail-module">
          <h3 className="x-rail-heading">Top makers</h3>
          {railStreams.slice(0, 4).map((stream) => (
            <div className="x-trend-item" key={stream.id}>
              <span className="x-trend-category">{stream.domain} · Maker</span>
              <strong className="x-trend-topic">{stream.name}</strong>
              <span className="x-trend-meta">{stream.evidence} evidence</span>
            </div>
          ))}
          {!railStreams.length && <span className="x-trend-category">No stream data yet.</span>}
          <Link className="x-rail-link" href="/">Open discovery →</Link>
        </div>
      </aside>
    </section>
  );
}
