"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams, readStreamsCache, fetchStreamSubscribers, readStreamStatsCache, writeStreamStatsCache } from "../lib/api/streams";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../lib/api/subscriptions";
import { updateUserProfile } from "../lib/sdkBackend";
import {
  fetchAgents,
  fetchAgentSubscriptions,
  readAgentSubsCache,
  readAgentsCache,
} from "../lib/api/agents";
import type { AgentProfile, AgentSubscription, StreamDetail, StreamTier, OwnedSubscriptionOption } from "../lib/types";
import OwnedSubscriptionCard from "../components/OwnedSubscriptionCard";
import MyStreamsSection from "../components/MyStreamsSection";
import { sha256Bytes } from "../lib/solana";
import { toHex } from "../lib/utils";
import { useUserProfile, type UserProfile } from "../lib/userProfile";
import { toast } from "../lib/toast";

export type ProfileTab = "subscriptions" | "streams" | "agents" | "actions";

export default function ProfileContent({ initialTab = "subscriptions" }: { initialTab?: ProfileTab }) {
  const { publicKey } = useWallet();
  const { profile, setProfile, followCounts, followCountsLoading } = useUserProfile();

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [ownedSubscriptionOptions, setOwnedSubscriptionOptions] = useState<OwnedSubscriptionOption[]>([]);
  const [streamCatalog, setStreamCatalog] = useState<StreamDetail[]>([]);
  const [subscriptionCards, setSubscriptionCards] = useState<ComponentProps<typeof OwnedSubscriptionCard>[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentSubscriptions, setAgentSubscriptions] = useState<AgentSubscription[]>([]);
  const [myStreamCount, setMyStreamCount] = useState<number | null>(null);
  const [totalSubscribers, setTotalSubscribers] = useState<number | null>(null);

  const activeTab = initialTab;
  const [actionsTab, setActionsTab] = useState<"editProfile" | "streamKeys">("editProfile");

  const walletAddr = publicKey?.toBase58();
  const walletShort = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : null;

  useEffect(() => {
    if (!walletAddr) return;
    void loadAgents();
    void loadAgentSubscriptions();
    void loadStreamStats();
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

    // Show cached data instantly before setting loading
    const cachedSubs = readSubscriptionsCache(walletAddr);
    const cachedStreams = readStreamsCache();
    if (cachedStreams?.streams?.length) {
      setStreamCatalog(cachedStreams.streams);
    }
    const hasCacheHit = cachedSubs !== null && cachedStreams !== null;
    if (cachedSubs?.subscriptions?.length && cachedStreams?.streams?.length) {
      await processSubscriptions(cachedSubs.subscriptions, cachedStreams.streams);
    }

    // Only show loading UI if there's no cache at all
    if (!hasCacheHit) setSubsLoading(true);
    try {
      let streamList: StreamDetail[] = cachedStreams?.streams ?? [];
      try {
        const streamsRes = await fetchStreams({ includeTiers: true });
        streamList = streamsRes.streams ?? [];
        setStreamCatalog(streamList);
      } catch {
        // keep cached streams if available
      }

      const subsRes = await fetchOnchainSubscriptions(walletAddr, { fresh: forceFresh });
      await processSubscriptions(subsRes.subscriptions ?? [], streamList);
    } catch (err: any) {
      toast(err?.message ?? "Failed to load subscriptions.", "error");
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
      // preserve existing UI on transient errors
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
      // preserve existing UI on transient errors
    }
  }

  const agentSubsById = useMemo(() => {
    const map = new Map<string, number>();
    agentSubscriptions.forEach((sub) => {
      map.set(sub.agentId, (map.get(sub.agentId) ?? 0) + 1);
    });
    return map;
  }, [agentSubscriptions]);

  async function loadStreamStats() {
    if (!walletAddr) return;
    // Show cached stats instantly
    const cached = readStreamStatsCache(walletAddr);
    if (cached) {
      setMyStreamCount(cached.streamCount);
      setTotalSubscribers(cached.totalSubscribers);
    }
    try {
      const data = await fetchStreams({ includeTiers: true });
      const mine = (data.streams ?? []).filter((s) => s.authority === walletAddr);
      setMyStreamCount(mine.length);
      const counts = await Promise.all(
        mine.map(async (stream) => {
          try {
            const res = await fetchStreamSubscribers(stream.id);
            return res.count;
          } catch {
            return 0;
          }
        })
      );
      const total = counts.reduce((sum, c) => sum + c, 0);
      setTotalSubscribers(total);
      writeStreamStatsCache(walletAddr, { streamCount: mine.length, totalSubscribers: total });
    } catch {
      // preserve existing UI on transient errors
    }
  }

  async function saveProfile() {
    if (!walletAddr) {
      toast("Connect your wallet first.", "warn");
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
      toast(err?.message ?? "Failed to update profile.", "error");
    } finally {
      setEditSaving(false);
    }
  }

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
                <div className="profile-header-wallet">{walletAddr}</div>
                {profile?.bio && (
                  <div className="x-trend-category" style={{ marginTop: 2 }}>{profile.bio}</div>
                )}
                <div className="profile-header-stats">
                  <span><strong>{followCounts?.following ?? "…"}</strong> Following</span>
                  <span><strong>{followCounts?.followers ?? "…"}</strong> Followers</span>
                  <span><strong>{myStreamCount ?? "…"}</strong> Streams</span>
                  <span><strong>{subsLoading ? "…" : subscriptionCards.length}</strong> Subscriptions</span>
                  <span><strong>{totalSubscribers ?? "…"}</strong> Subscribers</span>
                  <span><strong>{agentsLoading ? "…" : agents.length}</strong> Agents</span>
                </div>
              </div>
            </div>

            {activeTab === "subscriptions" && (
              <div className="profile-tab-content">
                <p className="profile-tab-description">
                  Every sub here is a soul-bound NFT sitting in your wallet — non-transferable, fully yours. Each one is your ticket to an on-chain stream and the signals it puts out.
                </p>
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
                {!subsLoading && subscriptionCards.length === 0 && (
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
                <p className="profile-tab-description">
                  These are your streams, live on Solana. Grab a Blink link and share it anywhere — one click and anyone can subscribe straight from their wallet.
                </p>
                <MyStreamsSection />
              </div>
            )}

            {activeTab === "agents" && (
              <div className="profile-tab-content">
                <p className="profile-tab-description">
                  Meet your agents — they do the heavy lifting so you don&#39;t have to. Spot a <span className="agent-legend-arrow agent-legend-arrow--publish"></span> blue arrow? That one&#39;s pushing signals out. See a <span className="agent-legend-arrow agent-legend-arrow--listen"></span> green arrow? It&#39;s tuned in and listening.
                </p>
                <div className="stream-card-grid">
                  {agents.map((agent) => {
                    const hasLinkedSubs = (agentSubsById.get(agent.id) ?? 0) > 0;
                    const canPublish = agent.role === "maker" || agent.role === "both";
                    const canListen = agent.role === "listener" || agent.role === "both" || hasLinkedSubs;
                    return (
                      <div className="stream-card" key={agent.id}>
                        <div className={`agent-flow-indicator${canPublish && canListen ? " agent-flow-indicator--both" : ""}`}>
                          {canPublish && (
                            <div className="agent-flow-lane agent-flow-lane--out">
                              <span>‹</span><span>‹</span><span>‹</span>
                            </div>
                          )}
                          {canListen && (
                            <div className="agent-flow-lane agent-flow-lane--in">
                              <span>›</span><span>›</span><span>›</span>
                            </div>
                          )}
                        </div>
                        <div className="stream-card-content">
                          {/* Top row: name + stream chip */}
                          <div className="stream-card-top">
                            <div className="stream-card-name-row">
                              <h3 className="stream-card-name">{agent.name}</h3>
                            </div>
                            {agent.streamId && (
                              <div className="chip-row">
                                <span className="chip">{agent.streamId}</span>
                              </div>
                            )}
                          </div>

                          {/* Middle row: badges */}
                          {agent.domain && (
                            <div className="stream-card-middle">
                              <div className="stream-card-header">
                                <span className="badge badge-sm badge-teal">{agent.domain}</span>
                              </div>
                            </div>
                          )}

                          {/* Bottom row: stats + manage */}
                          <div className="stream-card-bottom">
                            <div className="stream-card-desc">
                              {agent.agentPubkey && <p style={{ margin: 0 }}>Key: {agent.agentPubkey.slice(0, 5)}…{agent.agentPubkey.slice(-4)}</p>}
                              {agent.description && <p style={{ margin: 0 }}>{agent.description}</p>}
                            </div>
                            <Link className="button ghost" href={`/agent/${agent.id}`}>
                              Manage →
                            </Link>
                          </div>
                        </div>
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
                    <p className="profile-tab-description" style={{ marginBottom: 12 }}>
                      Make it yours — pick a name, drop a bio, and let the network know who&#39;s behind the signals.
                    </p>
                    <div style={{ maxWidth: "60%" }}>
                      <label className="input-label">Name</label>
                      <input
                        className="input"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Username"
                        style={{ marginBottom: 12 }}
                      />
                      <label className="input-label">Description</label>
                      <textarea
                        className="input"
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Bio"
                        rows={3}
                        style={{ resize: "vertical", marginBottom: 14 }}
                      />
                      <button
                        className="button secondary"
                        onClick={saveProfile}
                        disabled={editSaving}
                        style={{ width: "100%" }}
                      >
                        {editSaving ? "Saving..." : "Save Profile"}
                      </button>
                    </div>
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
