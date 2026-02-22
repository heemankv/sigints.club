import { StreamTier } from "./StreamStore";
import { sha256Hex } from "../utils/hash";

export function buildTiersSeed(tiers: StreamTier[]): string {
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

export function hashTiersHex(tiers: StreamTier[]): string {
  const seed = buildTiersSeed(tiers);
  return sha256Hex(Buffer.from(seed, "utf8"));
}
