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
};

function formatDate(ms?: number): string | null {
  if (!ms) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
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
}: OwnedSubscriptionCardProps) {
  const artUrl = getCardArtUrl(`${streamId}:${tierLabel}`);
  const expiresLabel = formatDate(expiresAt);
  const pricingLabel =
    pricingType === "subscription_unlimited"
      ? "monthly subscription"
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
        {expiresLabel && <p className="subtext">Expires {expiresLabel}</p>}
        <div className="data-card__actions">
          <a className="button ghost" href={`https://explorer.solana.com/address/${nftMint}?cluster=devnet`} target="_blank">
            View NFT
          </a>
        </div>
        <p className="subtext">Mint {nftMint.slice(0, 10)}…</p>
      </div>
    </div>
  );
}
