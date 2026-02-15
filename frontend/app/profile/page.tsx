"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchJson, postJson } from "../lib/api";
import { decodeSubscriptionAccount, resolveProgramId } from "../lib/solana";

type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
};

type BotProfile = {
  id: string;
  name: string;
  domain: string;
  description?: string;
  role: "maker" | "listener";
  evidence: string;
};

type SubscriptionRecord = {
  subscription: string;
  subscriber: string;
  persona: string;
  tierIdHex: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAt: number;
  quotaRemaining: number;
  status: number;
  nftMint: string;
};

export default function ProfilePage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [makerBots, setMakerBots] = useState<BotProfile[]>([]);
  const [listenerBots, setListenerBots] = useState<BotProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);

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

      <div className="section">
        <div className="section-head">
          <span className="kicker">Providers</span>
          <h2>Maker Bots</h2>
          <p>Agents you operate as information providers.</p>
        </div>
        <div className="module-grid">
          {makerBots.map((bot) => (
            <div className="module accent-teal" key={bot.id}>
              <div className="hud-corners" />
              <h3>{bot.name}</h3>
              <p>{bot.domain}</p>
              {bot.description && <p>{bot.description}</p>}
              <span className="badge">{bot.evidence}</span>
            </div>
          ))}
          {!makerBots.length && <div className="subtext">No maker bots registered yet.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="kicker">Listeners</span>
          <h2>Listener Bots</h2>
          <p>Bots you’ve created to consume signals.</p>
        </div>
        <div className="module-grid">
          {listenerBots.map((bot) => (
            <div className="module accent-orange" key={bot.id}>
              <div className="hud-corners" />
              <h3>{bot.name}</h3>
              <p>{bot.domain}</p>
              {bot.description && <p>{bot.description}</p>}
              <span className="badge">{bot.evidence}</span>
            </div>
          ))}
          {!listenerBots.length && <div className="subtext">No listener bots registered yet.</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="kicker">On-chain</span>
          <h2>Subscriptions</h2>
          <p>Subscriptions derived directly from on-chain NFT mints.</p>
        </div>
        <div className="stream">
          {subscriptions.map((sub) => (
            <div className="stream-item" key={sub.subscription}>
              <div>
                <strong>{sub.persona}</strong>
                <div className="subtext">Tier {sub.tierIdHex.slice(0, 8)}… · Pricing {sub.pricingType}</div>
                <div className="subtext">Evidence {sub.evidenceLevel} · Status {sub.status}</div>
                <div className="subtext">NFT mint {sub.nftMint.slice(0, 10)}…</div>
              </div>
              <a className="link" href={`https://explorer.solana.com/address/${sub.nftMint}?cluster=devnet`} target="_blank">
                NFT
              </a>
            </div>
          ))}
          {!subscriptions.length && <div className="subtext">No subscriptions yet.</div>}
        </div>
      </div>
    </section>
  );
}
