export type TierInput = {
  tierId: string;
  pricingType: "subscription_unlimited";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

export function buildTiersSeed(tiers: TierInput[]): string {
  const sorted = [...tiers].sort((a, b) => a.tierId.localeCompare(b.tierId));
  return sorted
    .map((tier) =>
      [
        tier.tierId,
        tier.pricingType,
        tier.price,
        tier.quota ?? "",
        tier.evidenceLevel,
      ].join("|")
    )
    .join("||");
}
