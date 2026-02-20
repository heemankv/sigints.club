import { getCardArtUrl } from "../lib/cardArt";

type OwnedSubscriptionCardProps = {
  personaName: string;
  personaId: string;
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
  personaName,
  personaId,
  tierLabel,
  price,
  evidenceLevel,
  pricingType,
  expiresAt,
  nftMint,
}: OwnedSubscriptionCardProps) {
  const artUrl = getCardArtUrl(`${personaId}:${tierLabel}`);
  const expiresLabel = formatDate(expiresAt);
  return (
    <div className="data-card">
      <div className="data-card__media">
        <img src={artUrl} alt={`${personaName} art`} />
        <div className="data-card__overlay">
          {evidenceLevel && <span className="badge">{evidenceLevel}</span>}
          {pricingType && <span className="badge accent">{pricingType.replace(/_/g, " ")}</span>}
        </div>
        <div className="data-card__tier">{tierLabel}</div>
      </div>
      <div className="data-card__body">
        <div className="data-card__title">
          <div>
            <h3>{personaName}</h3>
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
