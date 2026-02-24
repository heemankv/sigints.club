"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import PublishSignal from "./PublishSignal";
import DecryptPanel from "./DecryptPanel";
import FollowMaker from "./FollowMaker";
import SubscribeForm from "./SubscribeForm";
import KeyManager from "./KeyManager";
import type { StreamDetail } from "../../lib/types";
import type { StreamDetail as FallbackStreamDetail } from "../../lib/fallback";
import type { SignalEvent } from "../../lib/types";
import { fetchSignalEvents } from "../../lib/api/signals";
import { formatFullTimestamp, timeAgo } from "../../lib/utils";
import CopyBlinkButton from "../../components/CopyBlinkButton";

type AnyStream = StreamDetail | FallbackStreamDetail;

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <span className="copyable-address" onClick={copy} title={address}>
      <span className="mono">{short}</span>
      <span className="copyable-address__icon">{copied ? "Copied!" : "Copy"}</span>
    </span>
  );
}

export default function StreamPageClient({ stream }: { stream: AnyStream }) {
  const { publicKey } = useWallet();
  const [activityOpen, setActivityOpen] = useState(false);
  const [signalEvents, setSignalEvents] = useState<SignalEvent[]>([]);
  const lastEventIdRef = useRef<number>(0);
  const pollRef = useRef<number | null>(null);
  const isOwner =
    publicKey &&
    "authority" in stream &&
    stream.authority &&
    publicKey.toBase58() === stream.authority;
  const onchainAddress = "onchainAddress" in stream ? stream.onchainAddress : undefined;
  const visibility = "visibility" in stream ? stream.visibility : "private";

  useEffect(() => {
    let mounted = true;
    const streamId = stream.id;

    function sortEvents(events: SignalEvent[]) {
      return [...events].sort((a, b) => (b.createdAt - a.createdAt) || (b.id - a.id));
    }

    async function loadInitial() {
      try {
        const data = await fetchSignalEvents({ streamId, limit: 10 });
        if (!mounted) return;
        const events = sortEvents(data.events ?? []);
        setSignalEvents(events);
        if (events.length) {
          lastEventIdRef.current = Math.max(...events.map((e) => e.id));
        }
      } catch {
        if (!mounted) return;
        setSignalEvents([]);
      }
    }

    void loadInitial();

    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const after = lastEventIdRef.current;
        const data = await fetchSignalEvents({ streamId, limit: 10, after });
        if (!mounted) return;
        if (data.events?.length) {
          const newestId = Math.max(after, ...data.events.map((e) => e.id));
          lastEventIdRef.current = newestId;
          const incoming = sortEvents(data.events ?? []);
          setSignalEvents((prev) => {
            const merged = [...incoming, ...prev];
            const seen = new Set<number>();
            const deduped = merged.filter((event) => {
              if (seen.has(event.id)) return false;
              seen.add(event.id);
              return true;
            });
            return sortEvents(deduped).slice(0, 10);
          });
        }
      } catch {
        // ignore polling failures
      }
    }, 10_000);

    return () => {
      mounted = false;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [stream.id]);

  return (
    <div className="stream-detail">
      {/* Shared header */}
      <div className="stream-detail-header">
        {stream.domain && <span className="kicker">{stream.domain}</span>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 className="stream-detail-title" style={{ margin: 0 }}>{stream.name}</h1>
          <CopyBlinkButton streamId={stream.id} label="Copy Blink" />
        </div>
        {stream.description && <p className="subtext">{stream.description}</p>}
        {onchainAddress && (
          <p className="subtext">
            On-chain stream address: <CopyableAddress address={onchainAddress} />
          </p>
        )}
        <div className="badges">
          {stream.accuracy && <span className="badge">Accuracy {stream.accuracy}</span>}
          {stream.latency && <span className="badge">Latency {stream.latency}</span>}
          {"visibility" in stream && stream.visibility && (
            <span className={`badge ${stream.visibility === "private" ? "badge-private" : "badge-public"}`}>
              {stream.visibility}
            </span>
          )}
        </div>
      </div>

      <div className="stream-detail-section">
        <div className={`signal-activity${activityOpen ? " signal-activity--open" : ""}`}>
          <button
            className="signal-activity__toggle"
            onClick={() => setActivityOpen((prev) => !prev)}
          >
            <span>Signal Activity</span>
            <span className="signal-activity__meta">
              {signalEvents[0] ? `Last signal ${timeAgo(signalEvents[0].createdAt)} ago` : "No signals yet"}
            </span>
            <span className="signal-activity__chev">{activityOpen ? "▴" : "▾"}</span>
          </button>
          {activityOpen && (
            <div className="signal-activity__list">
              {signalEvents.length === 0 && (
                <div className="signal-activity__empty">No signals recorded yet.</div>
              )}
              {signalEvents.map((event) => (
                <div key={event.id} className="signal-activity__item">
                  <span className="signal-activity__time">{formatFullTimestamp(event.createdAt)}</span>
                  <span className="signal-activity__meta">{event.visibility}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isOwner ? (
        /* Owner view — publish flow */
        <div className="stream-detail-section">
          <h3 className="stream-detail-section-title">Publish Signal</h3>
          <p className="subtext">Step 1 prepares off-chain. Step 2 signs and records on-chain.</p>
          <PublishSignal
            streamId={stream.id}
            tierId={stream.tiers[0]?.tierId ?? "tier"}
            tiers={stream.tiers as StreamDetail["tiers"]}
            streamVisibility={"visibility" in stream ? stream.visibility : undefined}
            streamOnchainAddress={onchainAddress}
          />
        </div>
      ) : (
        /* Visitor view — subscribe + decrypt */
        <>
          {"tapestryProfileId" in stream && stream.tapestryProfileId && (
            <FollowMaker targetProfileId={stream.tapestryProfileId} />
          )}

          {visibility === "private" && (
            <div className="stream-detail-section">
              <h3 className="stream-detail-section-title">Encryption Key</h3>
              <p className="subtext">Register an X25519 key for this stream to decrypt private signals.</p>
              <KeyManager streamId={stream.id} streamOnchainAddress={onchainAddress} />
            </div>
          )}

          {stream.tiers.length > 0 && (
            <div className="stream-detail-section">
              <h3 className="stream-detail-section-title">Subscribe</h3>
              <p className="subtext">Choose a pricing tier and subscribe.</p>
              <div className="tier-cards">
                {stream.tiers.map((tier) => (
                  <div className="tier-card" key={tier.tierId}>
                    <div className="tier-card-header">
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{tier.tierId}</h4>
                      <span className="badge">{tier.price}</span>
                    </div>
                    <p className="subtext" style={{ margin: "0 0 10px", fontSize: 13 }}>
                      {tier.pricingType === "subscription_unlimited" ? "Monthly subscription" : tier.pricingType}
                      {tier.quota ? ` · Quota: ${tier.quota}` : ""}
                      {" · Evidence: "}{tier.evidenceLevel}
                    </p>
                    <SubscribeForm
                      streamId={stream.id}
                      tierId={tier.tierId}
                      pricingType={tier.pricingType}
                      evidenceLevel={tier.evidenceLevel}
                      price={tier.price}
                      quota={tier.quota}
                      streamOnchainAddress={onchainAddress}
                      streamAuthority={"authority" in stream ? stream.authority : undefined}
                      streamDao={"dao" in stream ? stream.dao : undefined}
                      streamVisibility={"visibility" in stream ? stream.visibility : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stream-detail-section">
            <h3 className="stream-detail-section-title">Decrypt Signal</h3>
            <DecryptPanel streamId={stream.id} />
          </div>
        </>
      )}
    </div>
  );
}
