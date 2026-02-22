"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { postJson } from "../lib/api";
import { fetchStreams, fetchStreamSubscribers } from "../lib/api/streams";
import type { StreamDetail } from "../lib/types";

export default function MyStreamsSection() {
  const { publicKey } = useWallet();
  const walletAddr = publicKey?.toBase58();

  const [myStreams, setMyStreams] = useState<StreamDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});

  const [publishOpen, setPublishOpen] = useState<Record<string, boolean>>({});
  const [publishTier, setPublishTier] = useState<Record<string, string>>({});
  const [publishVisibility, setPublishVisibility] = useState<Record<string, "public" | "private">>({});
  const [publishMessage, setPublishMessage] = useState<Record<string, string>>({});
  const [publishStatus, setPublishStatus] = useState<Record<string, string | null>>({});
  const [publishLoading, setPublishLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!walletAddr) return;
    void load();
  }, [walletAddr]);

  async function load() {
    setLoading(true);
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
      const tierDefaults: Record<string, string> = {};
      const visDefaults: Record<string, "public" | "private"> = {};
      mine.forEach((s) => {
        tierDefaults[s.id] = s.tiers?.[0]?.tierId ?? "";
        visDefaults[s.id] = "public";
      });
      setPublishTier(tierDefaults);
      setPublishVisibility(visDefaults);
    } catch {
      setMyStreams([]);
    } finally {
      setLoading(false);
    }
  }

  async function publishSignal(sid: string) {
    const tierId = publishTier[sid];
    const visibility = publishVisibility[sid] ?? "public";
    const message = publishMessage[sid] ?? "";
    if (!message) {
      setPublishStatus((prev) => ({ ...prev, [sid]: "Message is required." }));
      return;
    }
    setPublishLoading((prev) => ({ ...prev, [sid]: true }));
    setPublishStatus((prev) => ({ ...prev, [sid]: null }));
    try {
      const plaintextBase64 = btoa(unescape(encodeURIComponent(message)));
      const result = await postJson<{ signal?: { hash?: string }; onchainTx?: string }>(
        "/signals",
        { streamId: sid, tierId, plaintextBase64, visibility },
      );
      const hash = result?.signal?.hash ?? "";
      const txSig = result?.onchainTx ?? "";
      let msg = hash ? `Published. Hash: ${hash.slice(0, 16)}…` : "Signal published.";
      if (txSig) msg += ` · Tx: ${txSig.slice(0, 10)}…`;
      setPublishStatus((prev) => ({ ...prev, [sid]: msg }));
      setPublishMessage((prev) => ({ ...prev, [sid]: "" }));
    } catch (err: unknown) {
      setPublishStatus((prev) => ({
        ...prev,
        [sid]: err instanceof Error ? err.message : "Failed to publish",
      }));
    } finally {
      setPublishLoading((prev) => ({ ...prev, [sid]: false }));
    }
  }

  if (!publicKey) {
    return <p className="subtext">Connect your wallet to view your streams.</p>;
  }

  if (loading) {
    return <p className="subtext">Loading your streams…</p>;
  }

  if (myStreams.length === 0) {
    return (
      <div className="module">
        <p className="subtext">No streams registered yet.</p>
        <Link className="button ghost" href="/register-stream" style={{ marginTop: 12, display: "inline-block" }}>
          Register a Stream →
        </Link>
      </div>
    );
  }

  return (
    <div className="stream-card-grid">
      {myStreams.map((stream) => {
        const isOpen = publishOpen[stream.id] ?? false;
        const selTier = publishTier[stream.id] ?? stream.tiers?.[0]?.tierId ?? "";
        const visibility = publishVisibility[stream.id] ?? "public";
        const message = publishMessage[stream.id] ?? "";
        const pubLoading = publishLoading[stream.id] ?? false;
        const sigStatus = publishStatus[stream.id];

        return (
          <div className="stream-card" key={stream.id}>
            <div className="stream-card-header">
              {stream.domain && <span className="badge badge-teal">{stream.domain}</span>}
              {stream.evidence && <span className="badge badge-gold">{stream.evidence}</span>}
            </div>

            <h3 className="stream-card-name">{stream.name}</h3>

            {stream.description && (
              <p className="stream-card-desc">
                {stream.description.length > 100
                  ? `${stream.description.slice(0, 100)}…`
                  : stream.description}
              </p>
            )}

            <div className="stream-card-meta">
              {stream.accuracy && <span>{stream.accuracy} accuracy</span>}
              {stream.latency && <span>{stream.latency} latency</span>}
              {subscriberCounts[stream.id] !== undefined && (
                <span>{subscriberCounts[stream.id]} subscribers</span>
              )}
            </div>

            {stream.tiers?.length > 0 && (
              <div className="chip-row" style={{ marginTop: 8 }}>
                {stream.tiers.map((t) => (
                  <span className="chip" key={t.tierId}>{t.tierId}</span>
                ))}
              </div>
            )}

            <div className="stream-card-actions">
              <Link className="button ghost" href={`/stream/${stream.id}`}>
                View Stream →
              </Link>
              <button
                className="button primary"
                onClick={() => setPublishOpen((prev) => ({ ...prev, [stream.id]: !isOpen }))}
              >
                {isOpen ? "Close ▲" : "Publish Signal ▾"}
              </button>
            </div>

            {isOpen && (
              <div className="stream-publish-panel">
                <div className="stream-publish-row">
                  <label className="publish-label">Tier</label>
                  <select
                    className="input"
                    value={selTier}
                    onChange={(e) => setPublishTier((prev) => ({ ...prev, [stream.id]: e.target.value }))}
                  >
                    {stream.tiers.map((t) => (
                      <option key={t.tierId} value={t.tierId}>
                        {t.tierId} — {t.price}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="stream-publish-row">
                  <label className="publish-label">Visibility</label>
                  <div className="publish-vis-toggle">
                    <button
                      className={`vis-btn${visibility === "public" ? " vis-btn--active" : ""}`}
                      onClick={() => setPublishVisibility((prev) => ({ ...prev, [stream.id]: "public" }))}
                    >
                      Public
                    </button>
                    <button
                      className={`vis-btn${visibility === "private" ? " vis-btn--active" : ""}`}
                      onClick={() => setPublishVisibility((prev) => ({ ...prev, [stream.id]: "private" }))}
                    >
                      Private
                    </button>
                  </div>
                </div>

                <textarea
                  className="input"
                  value={message}
                  onChange={(e) => setPublishMessage((prev) => ({ ...prev, [stream.id]: e.target.value }))}
                  placeholder="Signal message…"
                  rows={3}
                  style={{ marginBottom: 0 }}
                />

                <button
                  className="button primary"
                  onClick={() => publishSignal(stream.id)}
                  disabled={pubLoading}
                  style={{ marginTop: 10 }}
                >
                  {pubLoading ? "Publishing…" : "Publish"}
                </button>

                {sigStatus && <p className="subtext" style={{ marginTop: 8 }}>{sigStatus}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
