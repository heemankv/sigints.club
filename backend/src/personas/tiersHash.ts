import { PersonaTier } from "./PersonaStore";
import { sha256Hex } from "../utils/hash";

export function buildTiersSeed(tiers: PersonaTier[]): string {
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

export function hashTiersHex(tiers: PersonaTier[]): string {
  const seed = buildTiersSeed(tiers);
  return sha256Hex(Buffer.from(seed, "utf8"));
}
