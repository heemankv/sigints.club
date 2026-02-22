"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchJson, postJson } from "../lib/api";
import { decodeSubscriptionAccount, resolveProgramId, sha256Bytes } from "../lib/solana";
import { fetchStreams } from "../lib/api/streams";
import { toHex } from "../lib/utils";
import type { BotProfile, StreamDetail, StreamTier } from "../lib/types";
import OwnedSubscriptionCard from "../components/OwnedSubscriptionCard";
import RegisterStreamForm from "../components/RegisterStreamForm";
import KeyManager from "../stream/[id]/KeyManager";

type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
};

type SubscriptionRecord = {
  subscription: string;
  subscriber: string;
  stream: string;
  tierIdHex: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAt: number;
  quotaRemaining: number;
  status: number;
  nftMint: string;
};

type TierLookupEntry = {
  stream: StreamDetail;
  tier: StreamTier;
};

function pricingTypeLabel(value?: number): string | undefined {
  if (value === undefined) return undefined;
  if (value === 1) return "subscription_unlimited";
  return "legacy";
}

function evidenceLabel(value?: number): string | undefined {
  if (value === undefined) return undefined;
  if (value === 0) return "trust";
  if (value === 1) return "verifier";
  return undefined;
}

export default function ProfilePage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [makerBots, setMakerBots] = useState<BotProfile[]>([]);
  const [listenerBots, setListenerBots] = useState<BotProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [streamLookup, setStreamLookup] = useState<Record<string, StreamDetail>>({});
  const [tierLookup, setTierLookup] = useState<Record<string, TierLookupEntry>>({});

  const [botName, setBotName] = useState("");
  const [botDomain, setBotDomain] = useState("");
  const [botDescription, setBotDescription] = useState("");
  const [botRole, setBotRole] = useState<"maker" | "listener">("maker");
  const [botEvidence, setBotEvidence] = useState<"trust" | "verifier" | "hybrid">("trust");

  useEffect(() => {
    const wallet = publicKey?.toBase58();
    if (!wallet) return;
    const walletKey = wallet;

    async function load() {
      try {
        const user = await fetchJson<{ user: UserProfile }>(`/users/${walletKey}`);
        setProfile(user.user);
      } catch {
        setProfile({ wallet: walletKey });
      }

      try {
        const makers = await fetchJson<{ bots: BotProfile[] }>(`/bots?owner=${walletKey}&role=maker`);
        setMakerBots(makers.bots);
      } catch {
        setMakerBots([]);
      }

      try {
        const listeners = await fetchJson<{ bots: BotProfile[] }>(`/bots?owner=${walletKey}&role=listener`);
        setListenerBots(listeners.bots);
      } catch {
        setListenerBots([]);
      }

      try {
        const programId = resolveProgramId();
        const filters = [
          {
            memcmp: {
              offset: 8,
              bytes: walletKey,
            },
          },
        ];
        const accounts = await connection.getProgramAccounts(programId, { filters });
        const decoded = accounts
          .map((acc) => decodeSubscriptionAccount(acc.pubkey, acc.account.data))
          .filter((item): item is SubscriptionRecord => item !== null);
        setSubscriptions(decoded);
      } catch {
        setSubscriptions([]);
      }

      try {
        const data = await fetchStreams({ includeTiers: true });
        const streamMap: Record<string, StreamDetail> = {};
        data.streams.forEach((stream) => {
          if (stream.onchainAddress) {
            streamMap[stream.onchainAddress] = stream;
          }
        });
        setStreamLookup(streamMap);

        const entries = await Promise.all(
          data.streams.flatMap((stream) =>
            stream.tiers.map(async (tier) => {
              const hash = await sha256Bytes(tier.tierId);
              const hex = toHex(hash);
              return [hex, { stream, tier }] as const;
            })
          )
        );
        setTierLookup(Object.fromEntries(entries));
      } catch {
        setStreamLookup({});
        setTierLookup({});
      }
    }

    load();
  }, [publicKey, connection]);

  async function createBot() {
    const wallet = publicKey?.toBase58();
    if (!wallet) {
      setStatus("Connect your wallet first.");
      return;
    }
    setStatus(null);
    try {
      const res = await postJson<{ bot: BotProfile }>("/bots", {
        ownerWallet: wallet,
        name: botName,
        domain: botDomain,
        description: botDescription,
        role: botRole,
        evidence: botEvidence,
      });
      if (botRole === "maker") {
        setMakerBots((prev) => [res.bot, ...prev]);
      } else {
        setListenerBots((prev) => [res.bot, ...prev]);
      }
      setBotName("");
      setBotDomain("");
      setBotDescription("");
      setStatus("Bot created.");
    } catch (err: any) {
      setStatus(err.message ?? "Failed to create bot");
    }
  }

  if (!publicKey) {
    return (
      <section className="section">
        <div className="section-head">
          <span className="kicker">Identity</span>
          <h1>Your Profile</h1>
          <p>Connect your wallet to view your maker bots and subscriptions.</p>
        </div>
        <div className="module accent-orange">
          <div className="hud-corners" />
          <p className="subtext">Wallet not connected.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="kicker">Control center</span>
        <h1>Your Profile</h1>
        <p>Manage maker bots, listener bots, and subscriptions.</p>
      </div>
      {/* DUMMY: replace with real subscriptions once on-chain data flows */}
      <div className="section">
        <div className="section-head">
          <span className="kicker">On-chain</span>
          <h2>Subscriptions</h2>
          <p>Subscriptions derived directly from on-chain NFT mints.</p>
        </div>
        <div className="data-grid">
          <OwnedSubscriptionCard
            streamName="BTC Alpha Signals"
            streamId="btc-alpha"
            tierLabel="tier-pro"
            price="0.5 SOL / mo"
            evidenceLevel="verifier"
            pricingType="subscription_unlimited"
            expiresAt={Date.now() + 30 * 24 * 60 * 60 * 1000}
            nftMint="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
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
          />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="kicker">Encryption</span>
          <h2>Wallet Encryption Key</h2>
          <p>Register a single keypair once and reuse it for all subscriptions.</p>
        </div>
        <KeyManager />
      </div>
      <div className="section">
        <div className="section-head">
          <span className="kicker">On-chain</span>
          <h2>Register Stream</h2>
          <p>Create a stream entry on-chain and publish it to the Explore marketplace.</p>
        </div>
        <RegisterStreamForm />
      </div>
      <div className="split">
        <div className="module accent-teal">
          <div className="hud-corners" />
          <h3>Identity</h3>
          <p className="subtext">Wallet: {publicKey.toBase58()}</p>
          {profile?.displayName && <p className="subtext">{profile.displayName}</p>}
          {profile?.bio && <p className="subtext">{profile.bio}</p>}
        </div>
        <div className="module">
          <div className="hud-corners" />
          <h3>Create Bot</h3>
          <input className="input" value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="Bot name" />
          <input className="input" value={botDomain} onChange={(e) => setBotDomain(e.target.value)} placeholder="Domain (e.g., pricing)" />
          <textarea value={botDescription} onChange={(e) => setBotDescription(e.target.value)} placeholder="Short description" />
          <div className="badges">
            <button className={`button ${botRole === "maker" ? "primary" : "ghost"}`} onClick={() => setBotRole("maker")}>
              Maker
            </button>
            <button className={`button ${botRole === "listener" ? "primary" : "ghost"}`} onClick={() => setBotRole("listener")}>
              Listener
            </button>
          </div>
          <div className="badges">
            {(["trust", "verifier", "hybrid"] as const).map((evidence) => (
              <button
                key={evidence}
                className={`button ${botEvidence === evidence ? "primary" : "ghost"}`}
                onClick={() => setBotEvidence(evidence)}
              >
                {evidence}
              </button>
            ))}
          </div>
          <button className="button secondary" onClick={createBot}>
            Register Bot
          </button>
          {status && <p className="subtext">{status}</p>}
        </div>
      </div>

      {/* DUMMY: remove these two sections when real bot data is wired */}
      <div className="section">
        <div className="section-head">
          <span className="kicker">Providers</span>
          <h2>Maker Bots</h2>
          <p>Agents you operate as information providers.</p>
        </div>
        <div className="module-grid">
          <div className="module accent-teal">
            <div className="hud-corners" />
            <h3>BTC Price Oracle</h3>
            <p>pricing</p>
            <p>Publishes BTC/USD price feeds every 5 min with multi-source aggregation.</p>
            <span className="badge">verifier</span>
          </div>
          <div className="module accent-teal">
            <div className="hud-corners" />
            <h3>Solana MEV Watch</h3>
            <p>mev</p>
            <p>Monitors the Solana mempool for sandwich attacks and liquidation opportunities.</p>
            <span className="badge">trust</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="kicker">Listeners</span>
          <h2>Listener Bots</h2>
          <p>Bots you’ve created to consume signals.</p>
        </div>
        <div className="module-grid">
          <div className="module accent-orange">
            <div className="hud-corners" />
            <h3>Signal Aggregator</h3>
            <p>aggregation</p>
            <p>Collects and re-publishes signals from multiple subscribed streams.</p>
            <span className="badge">hybrid</span>
          </div>
        </div>
      </div>

    </section>
  );
}
