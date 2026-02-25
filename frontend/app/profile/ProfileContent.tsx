"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { fetchStreams, readStreamsCache } from "../lib/api/streams";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../lib/api/subscriptions";
import {
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
import type { AgentProfile, AgentSubscription, StreamDetail, StreamTier, OwnedSubscriptionOption } from "../lib/types";
import OwnedSubscriptionCard from "../components/OwnedSubscriptionCard";
import MyStreamsSection from "../components/MyStreamsSection";
import RegisterAgentWizard from "../components/RegisterAgentWizard";
import {
  sha256Bytes,
  buildGrantPublisherInstruction,
  buildRevokePublisherInstruction,
  deriveStreamPda,
  resolveStreamRegistryId,
} from "../lib/solana";
import { toHex } from "../lib/utils";
import { useUserProfile, type UserProfile } from "../lib/userProfile";

export type ProfileTab = "subscriptions" | "streams" | "agents" | "actions";

export default function ProfileContent({ initialTab = "subscriptions" }: { initialTab?: ProfileTab }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
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

  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [linkStatus, setLinkStatus] = useState<Record<string, string | null>>({});
  const [publishStatus, setPublishStatus] = useState<Record<string, string | null>>({});
  const [managingAgentId, setManagingAgentId] = useState<string | null>(null);

  const activeTab = initialTab;
  const [actionsTab, setActionsTab] = useState<"editProfile" | "streamKeys">("editProfile");

  const walletAddr = publicKey?.toBase58();
  const walletShort = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : null;

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
    setSubsError(null);

    // Show cached data instantly before setting loading
    const cachedSubs = readSubscriptionsCache(walletAddr);
    const cachedStreams = readStreamsCache();
    const hasCacheHit = cachedSubs !== null && cachedStreams !== null;
    if (cachedSubs?.subscriptions?.length && cachedStreams?.streams?.length) {
      await processSubscriptions(cachedSubs.subscriptions, cachedStreams.streams);
    }

    // Only show loading UI if there's no cache at all
    if (!hasCacheHit) setSubsLoading(true);
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
    const cached = readAgentsCache(walletAddr);
    if (cached?.length) setAgents(cached);
    if (cached === null) setAgentsLoading(true);
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

  async function grantPublisher(agent: AgentProfile) {
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (!agent.streamId) {
        throw new Error("Agent is missing a publish stream.");
      }
      if (!agent.agentPubkey) {
        throw new Error("Agent public key is missing.");
      }
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, agent.streamId);
      const ix = await buildGrantPublisherInstruction({
        programId,
        stream: streamPda,
        authority: publicKey,
        agent: new PublicKey(agent.agentPubkey),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      setPublishStatus((prev) => ({ ...prev, [agent.id]: `Publish granted (${signature.slice(0, 10)}…)` }));
    } catch (err: any) {
      setPublishStatus((prev) => ({ ...prev, [agent.id]: err?.message ?? "Failed to grant publish." }));
    }
  }

  async function revokePublisher(agent: AgentProfile) {
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (!agent.streamId) {
        throw new Error("Agent is missing a publish stream.");
      }
      if (!agent.agentPubkey) {
        throw new Error("Agent public key is missing.");
      }
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, agent.streamId);
      const ix = await buildRevokePublisherInstruction({
        programId,
        stream: streamPda,
        authority: publicKey,
        agent: new PublicKey(agent.agentPubkey),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      setPublishStatus((prev) => ({ ...prev, [agent.id]: `Publish revoked (${signature.slice(0, 10)}…)` }));
    } catch (err: any) {
      setPublishStatus((prev) => ({ ...prev, [agent.id]: err?.message ?? "Failed to revoke publish." }));
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
  return (
    <>
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
                <RegisterAgentWizard
                  walletAddr={walletAddr!}
                  streamCatalog={streamCatalog}
                  ownedSubscriptionOptions={ownedSubscriptionOptions}
                  onAgentCreated={() => { void loadAgents(); void loadAgentSubscriptions(); }}
                />

                <h3 className="x-rail-heading" style={{ marginBottom: 10 }}>Your Agents</h3>
                <div className="stream-card-grid">
                  {agents.map((agent) => {
                    const linked = subscriptionsByAgent.get(agent.id) ?? [];
                    const linkedStreamIds = new Set(linked.map((sub) => sub.streamId));
                    const availableOptions = ownedSubscriptionOptions.filter(
                      (option) => !linkedStreamIds.has(option.streamId)
                    );
                    const isManaging = managingAgentId === agent.id;
                    const roleLabel = agent.role === "maker" ? "sender" : agent.role === "both" ? "sender + listener" : "listener";
                    return (
                      <div className="stream-card" key={agent.id}>
                        <div className="stream-card-row">
                          <div className="stream-card-identity">
                            <div className="stream-card-header">
                              {agent.domain && <span className="badge badge-teal">{agent.domain}</span>}
                              <span className="badge badge-gold">{roleLabel}</span>
                              {agent.evidence && <span className="badge">{agent.evidence}</span>}
                            </div>
                            <h3 className="stream-card-name">{agent.name}</h3>
                            <p className="stream-card-desc">
                              {agent.streamId ? `Stream: ${agent.streamId}` : "No publish stream"}
                              {agent.agentPubkey ? ` · Key: ${agent.agentPubkey.slice(0, 5)}…${agent.agentPubkey.slice(-4)}` : ""}
                            </p>
                          </div>

                          <div className="stream-card-stats">
                            <div className="stream-card-meta">
                              <span>{linked.length} linked sub{linked.length !== 1 ? "s" : ""}</span>
                            </div>
                            {linked.length > 0 && (
                              <div className="chip-row">
                                {linked.map((sub) => (
                                  <span className="chip" key={sub.id}>
                                    {streamNameById.get(sub.streamId) ?? sub.streamId} · {sub.tierId}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="stream-card-actions">
                            <button
                              className="button ghost"
                              onClick={() => setManagingAgentId(isManaging ? null : agent.id)}
                            >
                              {isManaging ? "Close" : "Manage →"}
                            </button>
                          </div>
                        </div>

                        {isManaging && (
                          <div className={`signal-activity signal-activity--open`} style={{ marginTop: 10 }}>
                            <button
                              className="signal-activity__toggle"
                              onClick={() => setManagingAgentId(null)}
                            >
                              <span>Management</span>
                              <span className="signal-activity__meta">{agent.name}</span>
                              <span className="signal-activity__chev">▴</span>
                            </button>

                            <div className="signal-activity__list">
                              {/* Grant / Revoke Publish */}
                              {agent.streamId && (
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <button
                                    className="button secondary"
                                    onClick={() => void grantPublisher(agent)}
                                    style={{ padding: "4px 10px", fontSize: 11 }}
                                  >
                                    Grant Publish
                                  </button>
                                  <button
                                    className="button ghost"
                                    onClick={() => void revokePublisher(agent)}
                                    style={{ padding: "4px 10px", fontSize: 11 }}
                                  >
                                    Revoke Publish
                                  </button>
                                  {publishStatus[agent.id] && (
                                    <span className="subtext">{publishStatus[agent.id]}</span>
                                  )}
                                </div>
                              )}

                              {/* Linked subscriptions */}
                              <div>
                                <span className="signal-activity__meta">Linked subscriptions</span>
                                {linked.length > 0 ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                                    {linked.map((sub) => (
                                      <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span className="chip">
                                          {streamNameById.get(sub.streamId) ?? sub.streamId} · {sub.tierId}
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
                                  <div className="signal-activity__empty" style={{ marginTop: 6 }}>
                                    No subscriptions linked yet.
                                  </div>
                                )}
                              </div>

                              {/* Subscription linker */}
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
                                <div className="signal-activity__empty">
                                  No unlinked subscriptions available.
                                </div>
                              )}
                              {linkStatus[agent.id] && (
                                <span className="subtext">{linkStatus[agent.id]}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {agentsLoading && agents.length === 0 && (
                    <div className="stream-card">
                      <div className="stream-card-row">
                        <div className="stream-card-identity">
                          <p className="subtext" style={{ margin: 0 }}>Loading agents…</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {!agentsLoading && agents.length === 0 && (
                    <div className="stream-card">
                      <div className="stream-card-row">
                        <div className="stream-card-identity">
                          <p className="subtext" style={{ margin: 0 }}>No agents registered yet.</p>
                        </div>
                      </div>
                    </div>
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
                    className={`maker-tab${actionsTab === "streamKeys" ? " maker-tab--active" : ""}`}
                    onClick={() => setActionsTab("streamKeys")}
                  >
                    Stream Keys
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

                {actionsTab === "streamKeys" && (
                  <div className="x-rail-module" style={{ border: 0, background: "transparent", padding: 0 }}>
                    <p className="subtext" style={{ marginBottom: 12 }}>
                      Encryption keys are scoped per stream. Open a stream to register or rotate the key used for private signals.
                    </p>
                    <Link className="button secondary" href="/streams" style={{ width: "100%" }}>
                      Browse Streams
                    </Link>
                  </div>
                )}


              </div>
            )}
          </>
        )}
    </>
  );
}
