"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams, readStreamsCache, fetchStreamSubscribers } from "../lib/api/streams";
import type { StreamDetail } from "../lib/types";

export default function MyStreamsSection() {
  const { publicKey } = useWallet();
  const walletAddr = publicKey?.toBase58();

  const [myStreams, setMyStreams] = useState<StreamDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!walletAddr) return;
    void load();
  }, [walletAddr]);

  async function load() {
    // Show cached streams instantly
    const cached = readStreamsCache();
    if (cached?.streams?.length) {
      const cachedMine = cached.streams.filter((s) => s.authority === walletAddr);
      if (cachedMine.length) setMyStreams(cachedMine);
    }
    if (cached === null) setLoading(true);

    try {
      const data = await fetchStreams({ includeTiers: true });
      const mine = (data.streams ?? []).filter((s) => s.authority === walletAddr);
      setMyStreams(mine);
      const countEntries = await Promise.all(
        mine.map(async (stream) => {
          try {
            const res = await fetchStreamSubscribers(stream.id);
            return [stream.id, res.count] as const;
          } catch {
            return [stream.id, 0] as const;
          }
        })
      );
      setSubscriberCounts(Object.fromEntries(countEntries));
    } catch {
      if (!myStreams.length) setMyStreams([]);
    } finally {
      setLoading(false);
    }
  }

  if (!publicKey) {
    return <p className="subtext">Connect your wallet to view your streams.</p>;
  }

  return (
    <div className="stream-card-grid">
      {myStreams.map((stream) => (
        <div className="stream-card" key={stream.id}>
          <div className="stream-card-row">

            {/* Identity */}
            <div className="stream-card-identity">
              <div className="stream-card-header">
                {stream.domain && <span className="badge badge-teal">{stream.domain}</span>}
                {stream.evidence && <span className="badge badge-gold">{stream.evidence}</span>}
                {stream.visibility && (
                  <span
                    className={`badge ${stream.visibility === "private" ? "badge-private" : "badge-public"}`}
                  >
                    {stream.visibility}
                  </span>
                )}
              </div>
              <h3 className="stream-card-name">{stream.name}</h3>
              {stream.description && (
                <p className="stream-card-desc">
                  {stream.description.length > 80
                    ? `${stream.description.slice(0, 80)}…`
                    : stream.description}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="stream-card-stats">
              {(stream.accuracy || stream.latency || subscriberCounts[stream.id] !== undefined) && (
                <div className="stream-card-meta">
                  {stream.accuracy && <span>{stream.accuracy} accuracy</span>}
                  {stream.latency && <span>{stream.latency} latency</span>}
                  {subscriberCounts[stream.id] !== undefined && (
                    <span>{subscriberCounts[stream.id]} subs</span>
                  )}
                </div>
              )}
              {stream.tiers?.length > 0 && (
                <div className="chip-row">
                  {stream.tiers.map((t) => (
                    <span className="chip" key={t.tierId}>{t.tierId}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="stream-card-actions">
              <Link className="button ghost" href={`/stream/${stream.id}`}>
                Manage →
              </Link>
            </div>

          </div>
        </div>
      ))}
      {loading && myStreams.length === 0 && (
        <div className="stream-card">
          <div className="stream-card-row">
            <div className="stream-card-identity">
              <p className="subtext" style={{ margin: 0 }}>Loading your streams…</p>
            </div>
          </div>
        </div>
      )}
      {!loading && myStreams.length === 0 && (
        <div className="stream-card">
          <div className="stream-card-row">
            <div className="stream-card-identity">
              <p className="subtext" style={{ margin: 0 }}>No streams registered yet.</p>
            </div>
            <div className="stream-card-actions">
              <Link className="button ghost" href="/register-stream">
                Register a Stream →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
