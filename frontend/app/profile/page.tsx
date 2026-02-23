"use client";

import { Suspense, useEffect, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams } from "../lib/api/streams";
import { fetchOnchainSubscriptions } from "../lib/api/subscriptions";
import { fetchUserProfile, fetchBots, createBot as sdkCreateBot } from "../lib/sdkBackend";
import type { BotProfile, OnChainSubscription, StreamDetail, StreamTier } from "../lib/types";
import OwnedSubscriptionCard from "../components/OwnedSubscriptionCard";
import MyStreamsSection from "../components/MyStreamsSection";
import KeyManager from "../stream/[id]/KeyManager";
import { sha256Bytes } from "../lib/solana";
import { toHex } from "../lib/utils";
import LeftNav from "../components/LeftNav";
import { useWalletKeyStatus } from "../lib/walletKeyStatus";

type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
};

function ProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey } = useWallet();
  const { needsWalletKey } = useWalletKeyStatus();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [makerBots, setMakerBots] = useState<BotProfile[]>([]);
  const [listenerBots, setListenerBots] = useState<BotProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<OnChainSubscription[]>([]);
  const [subscriptionCards, setSubscriptionCards] = useState<ComponentProps<typeof OwnedSubscriptionCard>[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);

  const [botName, setBotName] = useState("");
  const [botDomain, setBotDomain] = useState("");
  const [botRole, setBotRole] = useState<"maker" | "listener">("maker");
  const [botEvidence, setBotEvidence] = useState<"trust" | "verifier" | "hybrid">("trust");
  const [botStatus, setBotStatus] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"subscriptions" | "streams" | "actions">("subscriptions");

  const walletAddr = publicKey?.toBase58();
  const walletShort = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : null;

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "streams" || tab === "actions" || tab === "subscriptions") {
      setActiveTab(tab);
      return;
    }
    setActiveTab("subscriptions");
  }, [searchParams]);

  function switchTab(tab: "subscriptions" | "streams" | "actions") {
    setActiveTab(tab);
    const suffix = tab === "subscriptions" ? "" : `?tab=${tab}`;
    router.push(`/profile${suffix}`, { scroll: false });
  }

  useEffect(() => {
    if (!walletAddr) return;
    void load();
    async function load() {
      const wallet = walletAddr!;
      try {
        const u = await fetchUserProfile<{ user: UserProfile }>(wallet);
        setProfile(u.user);
      } catch {
        setProfile({ wallet });
      }
      try {
        const m = await fetchBots<{ bots: BotProfile[] }>({ owner: wallet, role: "maker" });
        setMakerBots(m.bots);
      } catch {
        setMakerBots([]);
      }
      try {
        const l = await fetchBots<{ bots: BotProfile[] }>({ owner: wallet, role: "listener" });
        setListenerBots(l.bots);
      } catch {
        setListenerBots([]);
      }
    }
  }, [walletAddr]);

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

  async function loadSubscriptions(forceFresh = false) {
    if (!walletAddr) return;
    setSubsLoading(true);
    setSubsError(null);
    try {
      const [subsRes, streamsRes] = await Promise.all([
        fetchOnchainSubscriptions(walletAddr, { fresh: forceFresh }),
        fetchStreams({ includeTiers: true }),
      ]);
      const subs = subsRes.subscriptions ?? [];
      setSubscriptions(subs);

      const streamByPda = new Map<string, StreamDetail>();
      (streamsRes.streams ?? []).forEach((stream) => {
        if (stream.onchainAddress) {
          streamByPda.set(stream.onchainAddress, stream);
        }
      });

      const tierIndexCache = new Map<string, Map<string, StreamTier>>();
      const cards: ComponentProps<typeof OwnedSubscriptionCard>[] = [];

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
      }

      setSubscriptionCards(cards);
    } catch (err: any) {
      setSubsError(err?.message ?? "Failed to load subscriptions.");
      setSubscriptionCards([]);
    } finally {
      setSubsLoading(false);
    }
  }

  async function createBot() {
    if (!walletAddr) { setBotStatus("Connect your wallet first."); return; }
    setBotStatus(null);
    try {
      const res = await sdkCreateBot<{ bot: BotProfile }>({
        ownerWallet: walletAddr,
        name: botName,
        domain: botDomain,
        description: "",
        role: botRole,
        evidence: botEvidence,
      });
      if (botRole === "maker") setMakerBots((prev) => [res.bot, ...prev]);
      else setListenerBots((prev) => [res.bot, ...prev]);
      setBotName("");
      setBotDomain("");
      setBotStatus("Bot created.");
    } catch (err: any) {
      setBotStatus(err.message ?? "Failed to create bot");
    }
  }

  const allBots = [...makerBots, ...listenerBots];

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
                <div className="profile-header-wallet">{walletAddr}</div>
              </div>
            </div>

            <div className="maker-tabs" style={{ marginTop: 20 }}>
              <button
                className={`maker-tab${activeTab === "subscriptions" ? " maker-tab--active" : ""}`}
                onClick={() => switchTab("subscriptions")}
              >
                My Subscriptions
              </button>
              <button
                className={`maker-tab${activeTab === "streams" ? " maker-tab--active" : ""}`}
                onClick={() => switchTab("streams")}
              >
                My Streams
              </button>
              <button
                className={`maker-tab${activeTab === "actions" ? " maker-tab--active" : ""}`}
                onClick={() => switchTab("actions")}
              >
                <span className="maker-tab-label">
                  Actions
                  {needsWalletKey && <span className="status-dot" aria-label="Wallet key missing" />}
                </span>
              </button>
            </div>

            {activeTab === "subscriptions" && (
              <div className="profile-tab-content">
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button
                    className="button ghost"
                    onClick={() => void loadSubscriptions(true)}
                    disabled={subsLoading}
                  >
                    Refresh
                  </button>
                </div>
                <div className="data-grid">
                  {subsLoading && <p className="subtext">Loading subscriptions…</p>}
                  {subsError && <p className="subtext">{subsError}</p>}
                  {!subsLoading && !subsError && subscriptionCards.length === 0 && (
                    <p className="subtext">No active subscriptions yet.</p>
                  )}
                  {subscriptionCards.map((card) => (
                    <OwnedSubscriptionCard key={`${card.streamId}:${card.tierLabel}`} {...card} />
                  ))}
                </div>
              </div>
            )}

            {activeTab === "streams" && (
              <div className="profile-tab-content">
                <MyStreamsSection />
              </div>
            )}

            {activeTab === "actions" && (
              <div className="profile-tab-content profile-tab-content--actions">
                <div className="profile-actions">
                  <div className="profile-actions-section">
                    <KeyManager variant="plain" />
                  </div>

                  <div className="profile-actions-section">
                    <div className="x-rail-module">
                    <h3 className="x-rail-heading">Register Stream</h3>
                    <p className="x-trend-category">Launch a new signal stream on-chain.</p>
                    <Link className="button ghost" href="/register-stream" style={{ marginTop: 10 }}>
                      Register Stream →
                    </Link>
                    </div>
                  </div>

                  <div className="profile-actions-section">
                    <div className="x-rail-module">
                    <h3 className="x-rail-heading">Create Bot</h3>
                    <input
                      className="input"
                      value={botName}
                      onChange={(e) => setBotName(e.target.value)}
                      placeholder="Bot name"
                      style={{ marginBottom: 8 }}
                    />
                    <input
                      className="input"
                      value={botDomain}
                      onChange={(e) => setBotDomain(e.target.value)}
                      placeholder="Domain (e.g. pricing)"
                      style={{ marginBottom: 8 }}
                    />
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <button
                        className={`button ${botRole === "maker" ? "primary" : "ghost"}`}
                        onClick={() => setBotRole("maker")}
                        style={{ flex: 1, fontSize: 13 }}
                      >
                        Maker
                      </button>
                      <button
                        className={`button ${botRole === "listener" ? "primary" : "ghost"}`}
                        onClick={() => setBotRole("listener")}
                        style={{ flex: 1, fontSize: 13 }}
                      >
                        Listener
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                      {(["trust", "verifier", "hybrid"] as const).map((ev) => (
                        <button
                          key={ev}
                          className={`button ${botEvidence === ev ? "primary" : "ghost"}`}
                          onClick={() => setBotEvidence(ev)}
                          style={{ flex: 1, fontSize: 11, padding: "6px 4px" }}
                        >
                          {ev}
                        </button>
                      ))}
                    </div>
                    <button className="button secondary" onClick={createBot} style={{ width: "100%" }}>
                      Register Bot
                    </button>
                    {botStatus && <p className="subtext" style={{ marginTop: 8 }}>{botStatus}</p>}
                    </div>
                  </div>

                  <div className="profile-actions-section">
                    <div className="x-rail-module">
                    <h3 className="x-rail-heading">Your Bots</h3>
                    {allBots.length > 0 ? (
                      allBots.map((bot) => (
                        <div className="x-trend-item" key={bot.id}>
                          <span className="x-trend-category">{bot.domain} · {bot.role}</span>
                          <strong className="x-trend-topic">{bot.name}</strong>
                          <span className="x-trend-meta">{bot.evidence}</span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="x-trend-item">
                          <span className="x-trend-category">pricing · maker</span>
                          <strong className="x-trend-topic">BTC Price Oracle</strong>
                          <span className="x-trend-meta">verifier</span>
                        </div>
                        <div className="x-trend-item">
                          <span className="x-trend-category">mev · maker</span>
                          <strong className="x-trend-topic">Solana MEV Watch</strong>
                          <span className="x-trend-meta">trust</span>
                        </div>
                        <div className="x-trend-item">
                          <span className="x-trend-category">aggregation · listener</span>
                          <strong className="x-trend-topic">Signal Aggregator</strong>
                          <span className="x-trend-meta">hybrid</span>
                        </div>
                      </>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="social-shell"><div className="social-main"><p className="subtext">Loading profile…</p></div></div>}>
      <ProfilePageInner />
    </Suspense>
  );
}
