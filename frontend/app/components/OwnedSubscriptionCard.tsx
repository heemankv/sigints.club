import { getCardArtUrl } from "../lib/cardArt";

type OwnedSubscriptionCardProps = {
  streamName: string;
  streamId: string;
  tierLabel: string;
  price?: string;
  evidenceLevel?: string;
  pricingType?: string;
  expiresAt?: number;
  nftMint: string;
  description?: string;
};

function formatDate(ms?: number): string | null {
  if (!ms) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysRemaining(ms?: number): number | null {
  if (!ms) return null;
  const diff = ms - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function expiryColor(days: number | null): string {
  if (days === null) return "";
  if (days <= 7) return "sub-expiry--critical";
  if (days <= 14) return "sub-expiry--warn";
  return "sub-expiry--ok";
}

export default function OwnedSubscriptionCard({
  streamName,
  streamId,
  tierLabel,
  price,
  evidenceLevel,
  pricingType,
  expiresAt,
  nftMint,
  description,
}: OwnedSubscriptionCardProps) {
  const artUrl = getCardArtUrl(`${streamId}:${tierLabel}`);
  const expiresLabel = formatDate(expiresAt);
  const days = daysRemaining(expiresAt);
  const pricingLabel =
    pricingType === "subscription_unlimited"
      ? "Monthly subscription"
      : pricingType?.replace(/_/g, " ");

  return (
    <div className="data-card">
      <div className="data-card__media">
        <img src={artUrl} alt={`${streamName} art`} />
        <div className="data-card__overlay">
          {evidenceLevel && <span className="badge">{evidenceLevel}</span>}
          {pricingLabel && <span className="badge accent">{pricingLabel}</span>}
        </div>
        <div className="data-card__tier">{tierLabel}</div>
      </div>

      <div className="data-card__body">
        <div className="data-card__title">
          <div>
            <h3>{streamName}</h3>
            <p className="subtext">Subscription NFT</p>
          </div>
          {price && <div className="data-card__price">{price}</div>}
        </div>

        {description && <p className="data-card__desc">{description}</p>}

        {nftMint && (
          <a
            className="data-card__mint"
            href={`https://explorer.solana.com/address/${nftMint}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {nftMint}
          </a>
        )}

        {expiresLabel && (
          <div className={`sub-expiry ${expiryColor(days)}`}>
            <span className="sub-expiry__date">Expires {expiresLabel}</span>
            {days !== null && (
              <span className="sub-expiry__pill">
                {days === 0 ? "Expires today" : `${days}d left`}
              </span>
            )}
          </div>
        )}

        <div className="data-card__actions" />
      </div>
    </div>
  );
}
