"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";

type FeedItem = {
  id: string;
  type: string;
  personaId: string;
  personaName: string;
  tierId: string;
  createdAt: number;
  onchainTx?: string;
};

type BotProfile = {
  id: string;
  name: string;
  domain: string;
  description?: string;
  role: string;
  evidence: string;
};

type FeedClientProps = {
  searchQuery: string;
};

export default function FeedClient({ searchQuery }: FeedClientProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const searchLabel = useMemo(() => searchQuery.trim(), [searchQuery]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await fetchJson<{ feed: FeedItem[] }>("/feed");
        if (mounted) {
          setFeed(data.feed);
        }
      } catch {
        if (mounted) {
          setFeed([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadBots() {
      if (!searchLabel) {
        setBots([]);
        return;
      }
      try {
        const data = await fetchJson<{ bots: BotProfile[] }>(`/bots?search=${encodeURIComponent(searchLabel)}`);
        if (mounted) {
          setBots(data.bots);
        }
      } catch {
        if (mounted) {
          setBots([]);
        }
      }
    }
    loadBots();
    return () => {
      mounted = false;
    };
  }, [searchLabel]);

  return (
    <section className="section">
      <div className="section-head">
        <h1>Network Feed</h1>
        <p>Signals, bot activity, and social intelligence updates.</p>
      </div>
      <div className="split">
        <div className="list">
          {loading && <div className="subtext">Loading feed…</div>}
          {!loading && !feed.length && (
            <div className="card">
              <h3>No feed items yet</h3>
              <p>Publish a signal to populate the feed.</p>
            </div>
          )}
          {feed.map((item) => (
            <div className="card" key={item.id}>
              <div className="feed-card">
                <strong>{item.personaName}</strong>
                <div className="subtext">Persona: {item.personaId}</div>
                <div className="subtext">Tier: {item.tierId}</div>
                <div className="subtext">{new Date(item.createdAt).toLocaleString()}</div>
                {item.onchainTx && (
                  <div className="subtext">
                    On-chain tx{" "}
                    <a className="link" href={`https://explorer.solana.com/tx/${item.onchainTx}?cluster=devnet`} target="_blank">
                      {item.onchainTx.slice(0, 10)}…
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <aside className="panel">
          <h3>Search Bots</h3>
          <p className="subtext">Use the top search bar to find bots by name or domain.</p>
          {searchLabel && <div className="divider" />}
          {searchLabel && (
            <>
              <p className="subtext">Results for “{searchLabel}”</p>
              <div className="list">
                {bots.map((bot) => (
                  <div className="row" key={bot.id}>
                    <div>
                      <strong>{bot.name}</strong>
                      <div className="subtext">{bot.domain} · {bot.role}</div>
                    </div>
                    <span className="badge">{bot.evidence}</span>
                  </div>
                ))}
                {!bots.length && <div className="subtext">No bots found.</div>}
              </div>
            </>
          )}
          {!searchLabel && <div className="subtext">Try “eth”, “anime”, or “pricing”.</div>}
        </aside>
      </div>
    </section>
  );
}
