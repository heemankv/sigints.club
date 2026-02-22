"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchJson, postJson } from "../lib/api";
import type { BotProfile } from "../lib/types";
import OwnedSubscriptionCard from "../components/OwnedSubscriptionCard";
import KeyManager from "../stream/[id]/KeyManager";
import MyStreamsSection from "../components/MyStreamsSection";

type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
};

const NAV_ITEMS = [
  {
    href: "/feed",
    label: "Feed",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/",
    label: "Discover",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    href: "/signals",
    label: "Signals",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: "/register-stream",
    label: "Register",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
];

type ProfileTab = "subscriptions" | "streams";

export default function ProfilePage() {
  const pathname = usePathname();
  const { publicKey } = useWallet();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("subscriptions");
  const [makerBots, setMakerBots] = useState<BotProfile[]>([]);
  const [listenerBots, setListenerBots] = useState<BotProfile[]>([]);

  const [botName, setBotName] = useState("");
  const [botDomain, setBotDomain] = useState("");
  const [botRole, setBotRole] = useState<"maker" | "listener">("maker");
  const [botEvidence, setBotEvidence] = useState<"trust" | "verifier" | "hybrid">("trust");
  const [botStatus, setBotStatus] = useState<string | null>(null);

  const walletAddr = publicKey?.toBase58();
  const walletShort = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : null;

  useEffect(() => {
    if (!walletAddr) return;
    void load();
    async function load() {
      try {
        const u = await fetchJson<{ user: UserProfile }>(`/users/${walletAddr}`);
        setProfile(u.user);
      } catch {
        setProfile({ wallet: walletAddr! });
      }
      try {
        const m = await fetchJson<{ bots: BotProfile[] }>(`/bots?owner=${walletAddr}&role=maker`);
        setMakerBots(m.bots);
      } catch {
        setMakerBots([]);
      }
      try {
        const l = await fetchJson<{ bots: BotProfile[] }>(`/bots?owner=${walletAddr}&role=listener`);
        setListenerBots(l.bots);
      } catch {
        setListenerBots([]);
      }
    }
  }, [walletAddr]);

  async function createBot() {
    if (!walletAddr) { setBotStatus("Connect your wallet first."); return; }
    setBotStatus(null);
    try {
      const res = await postJson<{ bot: BotProfile }>("/bots", {
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

      {/* ─── Left: nav sidebar ─── */}
      <aside className="x-sidebar">
        <nav className="x-nav">
          {NAV_ITEMS.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`x-nav-item${pathname === href ? " x-nav-item--active" : ""}`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {walletAddr && (
          <div className="profile-sidebar-id">
            <div className="xpost-avatar-circle" style={{ flexShrink: 0 }}>
              {walletAddr[0].toUpperCase()}
            </div>
            <div className="profile-sidebar-meta">
              {profile?.displayName && (
                <div className="profile-sidebar-name">{profile.displayName}</div>
              )}
              <div className="profile-sidebar-wallet">{walletShort}</div>
            </div>
          </div>
        )}

        <a
          href="https://www.usetapestry.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="x-sidebar-tapestry"
        >
          <span className="x-sidebar-tapestry-label">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/67814d9fc76ba46748750247/678fe574dc9c8c78bc2af16f_logo_full.svg"
            alt="Tapestry"
            className="x-sidebar-tapestry-logo"
          />
        </a>
      </aside>

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

            {/* Tab bar */}
            <div className="feed-tabs-bar">
              <button
                className={`feed-tab${activeTab === "subscriptions" ? " feed-tab--active" : ""}`}
                onClick={() => setActiveTab("subscriptions")}
              >
                Subscriptions
              </button>
              <button
                className={`feed-tab${activeTab === "streams" ? " feed-tab--active" : ""}`}
                onClick={() => setActiveTab("streams")}
              >
                My Streams
              </button>
            </div>

            {/* Subscriptions tab */}
            {activeTab === "subscriptions" && (
              <div className="profile-tab-content">
                <div className="data-grid">
                  {/* DUMMY: replace with real on-chain subscriptions */}
                  <OwnedSubscriptionCard
                    streamName="BTC Alpha Stream"
                    streamId="btc-alpha"
                    tierLabel="tier-pro"
                    price="0.5 SOL / mo"
                    evidenceLevel="verifier"
                    pricingType="subscription_unlimited"
                    expiresAt={Date.now() + 30 * 24 * 60 * 60 * 1000}
                    nftMint="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                    description="Real-time BTC alpha signals with multi-source aggregation and on-chain evidence."
                  />
                  <OwnedSubscriptionCard
                    streamName="DeFi Liquidations"
                    streamId="defi-liq"
                    tierLabel="tier-standard"
                    price="0.1 SOL / mo"
                    evidenceLevel="trust"
                    pricingType="subscription_unlimited"
                    expiresAt={Date.now() + 7 * 24 * 60 * 60 * 1000}
                    nftMint="5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
                    description="Monitors DeFi protocols for liquidation events across Aave, Compound, and Solend."
                  />
                  <OwnedSubscriptionCard
                    streamName="Solana MEV Watch"
                    streamId="sol-mev"
                    tierLabel="tier-elite"
                    price="1 SOL / mo"
                    evidenceLevel="verifier"
                    pricingType="subscription_unlimited"
                    expiresAt={Date.now() + 14 * 24 * 60 * 60 * 1000}
                    nftMint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
                    description="Tracks sandwich attacks and MEV opportunities across the Solana mempool in real time."
                  />
                </div>
              </div>
            )}

            {/* My Streams tab */}
            {activeTab === "streams" && (
              <div className="profile-tab-content">
                <MyStreamsSection />
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Right: action rail ─── */}
      <aside className="social-rail">

        {/* Maker quick links */}
        <div className="x-rail-module">
          <h3 className="x-rail-heading">Maker</h3>
          <Link className="x-trend-item" href="/register-stream" style={{ cursor: "pointer" }}>
            <strong className="x-trend-topic">Register Stream</strong>
            <span className="x-trend-category">Launch a new signal stream on-chain</span>
          </Link>
          <button
            className="x-rail-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "12px 0 0", textAlign: "left", fontFamily: "inherit" }}
            onClick={() => setActiveTab("streams")}
          >
            View My Streams →
          </button>
        </div>

        {/* Create Bot */}
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

        {/* Encryption Key */}
        <KeyManager />

        {/* Your Bots */}
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
            /* DUMMY: remove when real bot data is wired */
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

      </aside>
    </section>
  );
}
