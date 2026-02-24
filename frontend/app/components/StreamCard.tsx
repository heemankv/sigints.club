import Link from "next/link";
import type { StreamDetail } from "../lib/types";
import { getCardArtUrl } from "../lib/cardArt";

type StreamCardProps = {
  stream: StreamDetail;
  onSubscribe?: (streamId: string) => void;
  viewerWallet?: string | null;
  highlight?: boolean;
};

function formatTierLabel(tierId: string): string {
  return tierId.replace(/^tier-/, "").replace(/-/g, " ").toUpperCase();
}

function formatMeta(stream: StreamDetail): string {
  const parts = [stream.domain, stream.accuracy, stream.latency].filter(Boolean);
  return parts.join(" • ");
}

function formatPricingLabel(pricingType?: string): string {
  if (!pricingType) return "subscription";
  if (pricingType === "subscription_unlimited") return "monthly subscription";
  return pricingType.replace(/_/g, " ");
}

export default function StreamCard({ stream, onSubscribe, viewerWallet, highlight }: StreamCardProps) {
  const primaryTier = stream.tiers?.[0];
  const tierId = primaryTier?.tierId ?? "tier";
  const tierLabel = formatTierLabel(tierId);
  const artUrl = getCardArtUrl(`${stream.id}:${tierId}`);
  const evidenceLabel = primaryTier?.evidenceLevel ?? stream.evidence;
  const pricingLabel = formatPricingLabel(primaryTier?.pricingType);
  const priceLabel = primaryTier?.price ?? stream.price;
  const meta = formatMeta(stream);
  const hasTier = Boolean(primaryTier);
  const visibilityLabel = stream.visibility === "public" ? "Public" : "Private";
  const isOwner = Boolean(viewerWallet && stream.authority && viewerWallet === stream.authority);
  const canSubscribe = hasTier && !isOwner;

  return (
    <div className={`data-card data-card--compact data-card--side${highlight ? " data-card--highlight" : ""}`}>
      <div className="data-card__media">
        <img src={artUrl} alt={`${stream.name} art`} />
        <div className="data-card__overlay">
          {evidenceLabel && <span className="badge">{evidenceLabel}</span>}
          <span className="badge">{visibilityLabel}</span>
          <span className="badge accent">{pricingLabel}</span>
        </div>
        <div className="data-card__tier">{tierLabel}</div>
      </div>

      <div className="data-card__body">
        <div className="data-card__title">
          <div>
            <h3>{stream.name}</h3>
            <p className="subtext">{meta || "Stream"}</p>
          </div>
          {priceLabel && <div className="data-card__price">{priceLabel}</div>}
        </div>

        {stream.description && (
          <p className="data-card__desc">
            {stream.description.length > 160
              ? `${stream.description.slice(0, 160)}…`
              : stream.description}
          </p>
        )}

        {!hasTier && (
          <p className="subtext">No tiers configured yet.</p>
        )}

        <div className="data-card__actions">
          {!isOwner && (
            <button
              className="button primary"
              onClick={() => {
                if (!canSubscribe) return;
                onSubscribe?.(stream.id);
              }}
              disabled={!canSubscribe}
            >
              Subscribe
            </button>
          )}
          <Link className="button ghost" href={`/stream/${stream.id}`}>
            View Stream →
          </Link>
        </div>
      </div>
      {isOwner && (
        <span className="data-card__owner-tag">
          <span className="data-card__owner-tag__icon">✉</span>
          Yours
        </span>
      )}
    </div>
  );
}
