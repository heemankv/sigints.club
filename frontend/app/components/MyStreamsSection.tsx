"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams, readStreamsCache, fetchStreamSubscribers } from "../lib/api/streams";
import type { StreamDetail } from "../lib/types";
import CopyBlinkButton from "./CopyBlinkButton";

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
      // preserve existing UI on transient errors
    } finally {
      setLoading(false);
    }
  }

  if (!publicKey) {
    return <p className="subtext">Connect your wallet to view your streams.</p>;
  }

  return (
    <div className="stream-card-grid">
      {myStreams.map((stream) => {
        const subCount = subscriberCounts[stream.id];
        const desc = stream.description
          ? stream.description.length > 80
            ? `${stream.description.slice(0, 80)}…`
            : stream.description
          : null;
        const subDesc = [
          subCount !== undefined ? `${subCount} subs` : null,
          desc,
        ].filter(Boolean).join(" | ");

        const priceLabel = stream.tiers?.[0]?.price ?? null;
        const priceMatch = priceLabel?.match(/^(.+?)\s*\/\s*mo(?:nth)?$/i);
        const priceAmount = priceMatch ? priceMatch[1] : priceLabel;
        const hasPeriod = Boolean(priceMatch);

        return (
          <div className="stream-card" key={stream.id}>
            {/* Price stripe — solid orange bar, expands on hover */}
            {priceLabel && (
              <div className="stream-card-price-stripe">
                <span className="stream-card-price-label">
                  {priceAmount}
                  {hasPeriod && <span className="stream-card-price-period">/month</span>}
                </span>
              </div>
            )}

            <div className="stream-card-content">
              {/* Top row: name + Copy Blink left, stream ID right */}
              <div className="stream-card-top">
                <div className="stream-card-name-row">
                  <h3 className="stream-card-name">{stream.name}</h3>
                  <CopyBlinkButton streamId={stream.id} label="Copy Blink" className="stream-card-copy-blink" />
                </div>
                <span className="chip">{stream.id}</span>
              </div>

              {/* Tags + stats */}
              <div className="stream-card-middle">
                <div className="stream-card-header">
                  {stream.domain && <span className="badge badge-sm badge-teal">{stream.domain}</span>}
                  {stream.evidence && <span className="badge badge-sm badge-gold">{stream.evidence}</span>}
                  {stream.visibility && (
                    <span
                      className={`badge badge-sm ${stream.visibility === "private" ? "badge-private" : "badge-public"}`}
                    >
                      {stream.visibility}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom row: subs | description left, Manage right */}
              <div className="stream-card-bottom">
                {subDesc && <p className="stream-card-desc">{subDesc}</p>}
                <Link className="button ghost" href={`/stream/${stream.id}`}>
                  Manage →
                </Link>
              </div>
            </div>
          </div>
        );
      })}
      {loading && myStreams.length === 0 && (
        <div className="stream-card">
          <p className="subtext" style={{ margin: 0 }}>Loading your streams…</p>
        </div>
      )}
      {!loading && myStreams.length === 0 && (
        <div className="stream-card" style={{ maxWidth: "50%" }}>
          <div className="stream-card-bottom">
            <p className="subtext" style={{ margin: 0 }}>No streams registered yet.</p>
            <Link className="button ghost" href="/register-stream">
              Register a Stream →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
