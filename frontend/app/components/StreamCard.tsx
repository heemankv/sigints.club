import Link from "next/link";
import type { StreamDetail } from "../lib/types";
import CopyBlinkButton from "./CopyBlinkButton";

type StreamCardProps = {
  stream: StreamDetail;
  viewerWallet?: string | null;
  highlight?: boolean;
  isSubscribed?: boolean;
};

function formatTierLabel(tierId: string): string {
  return tierId.replace(/^tier-/, "").replace(/-/g, " ").toUpperCase();
}

export default function StreamCard({ stream, viewerWallet, highlight, isSubscribed }: StreamCardProps) {
  const primaryTier = stream.tiers?.[0];
  const tierLabel = primaryTier ? formatTierLabel(primaryTier.tierId) : null;
  const priceLabel = primaryTier?.price ?? stream.price;
  const evidenceLabel = primaryTier?.evidenceLevel ?? stream.evidence;
  const visibilityLabel = stream.visibility === "public" ? "Public" : "Private";
  const isOwner = Boolean(viewerWallet && stream.authority && viewerWallet === stream.authority);
  const hasTier = Boolean(primaryTier);
  const canSubscribe = hasTier && !isOwner;

  const desc = stream.description
    ? stream.description.length > 120
      ? `${stream.description.slice(0, 120)}…`
      : stream.description
    : null;

  return (
    <div className={`stream-card${highlight ? " stream-card--highlight" : ""}`}>
      {/* Price stripe — hidden, revealed on hover */}
      {priceLabel && (() => {
        const match = priceLabel.match(/^(.+?)\s*\/\s*mo(?:nth)?$/i);
        const amount = match ? match[1] : priceLabel;
        const hasPeriod = Boolean(match);
        return (
          <div className="stream-card-price-stripe">
            <span className="stream-card-price-label">
              {amount}
              {hasPeriod && <span className="stream-card-price-period">/month</span>}
            </span>
          </div>
        );
      })()}

      {/* Card content — shifts right on hover */}
      <div className="stream-card-content">
        {/* Top row: name + Copy Blink left, Yours tag right */}
        <div className="stream-card-top">
          <div className="stream-card-name-row">
            <h3 className="stream-card-name">{stream.name}</h3>
            <CopyBlinkButton streamId={stream.id} label="Copy Blink" className="stream-card-copy-blink" />
          </div>
          {isOwner && (
            <span className="data-card__owner-tag data-card__owner-tag--inline">
              <span className="data-card__owner-tag__icon">✉</span>
              Yours
            </span>
          )}
          {!isOwner && isSubscribed && (
            <span className="data-card__owner-tag data-card__owner-tag--inline data-card__owner-tag--subscribed">
              <span className="data-card__owner-tag__icon">✓</span>
              Subscribed
            </span>
          )}
        </div>

        {/* Tags + stats */}
        <div className="stream-card-middle">
          <div className="stream-card-header">
            {stream.domain && <span className="badge badge-sm badge-teal">{stream.domain}</span>}
            {evidenceLabel && <span className="badge badge-sm badge-gold">{evidenceLabel}</span>}
            <span className={`badge badge-sm ${stream.visibility === "private" ? "badge-private" : "badge-public"}`}>
              {visibilityLabel}
            </span>
          </div>
          {(stream.accuracy || stream.latency) && (
            <div className="stream-card-meta">
              {stream.accuracy && <span>{stream.accuracy} accuracy</span>}
              {stream.latency && <span>{stream.latency} latency</span>}
            </div>
          )}
        </div>

        {/* Bottom row: description left, actions right */}
        <div className="stream-card-bottom">
          {desc && <p className="stream-card-desc">{desc}</p>}
          <div className="stream-card-bottom-actions">
            {!isOwner && !isSubscribed && canSubscribe ? (
              <Link className="button primary" href={`/stream/${stream.id}`}>
                Subscribe
              </Link>
            ) : (
              <Link className="button ghost" href={`/stream/${stream.id}`}>
                View Stream →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
