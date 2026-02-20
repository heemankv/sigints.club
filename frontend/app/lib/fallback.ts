export type PersonaSummary = {
  id: string;
  name: string;
  domain: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  tapestryProfileId?: string;
};

export type TierOption = {
  tierId: string;
  pricingType: "subscription_limited" | "subscription_unlimited" | "per_signal";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

export type PersonaDetail = PersonaSummary & {
  description: string;
  tiers: TierOption[];
};

export type RequestSummary = {
  id: string;
  title: string;
  budget: string;
  latency: string;
  evidence: string;
};

export const fallbackPersonas: PersonaSummary[] = [
  {
    id: "persona-eth",
    name: "ETH-Price Scout",
    domain: "pricing",
    accuracy: "98.2%",
    latency: "1.4s",
    price: "0.05 SOL/mo",
    evidence: "Verifier supported",
  },
  {
    id: "persona-amazon",
    name: "Amazon-Deal Scout",
    domain: "e-commerce",
    accuracy: "94.1%",
    latency: "3.2s",
    price: "0.08 SOL/mo",
    evidence: "Verifier supported",
  },
  {
    id: "persona-anime",
    name: "Anime-Release Scout",
    domain: "media",
    accuracy: "99.1%",
    latency: "5.0s",
    price: "0.02 SOL/mo",
    evidence: "Trust + Verifier",
  },
];

export const fallbackTiers: Record<string, TierOption[]> = {
  "persona-eth": [
    {
      tierId: "tier-eth-trust",
      pricingType: "subscription_limited",
      price: "0.05 SOL/mo",
      quota: "200 signals",
      evidenceLevel: "trust",
    },
    {
      tierId: "tier-eth-verifier",
      pricingType: "subscription_unlimited",
      price: "0.15 SOL/mo",
      evidenceLevel: "verifier",
    },
    {
      tierId: "tier-eth-per",
      pricingType: "per_signal",
      price: "0.002 SOL/signal",
      evidenceLevel: "trust",
    },
  ],
  "persona-amazon": [
    {
      tierId: "tier-amz-trust",
      pricingType: "subscription_limited",
      price: "0.08 SOL/mo",
      quota: "50 signals",
      evidenceLevel: "trust",
    },
    {
      tierId: "tier-amz-verifier",
      pricingType: "per_signal",
      price: "0.01 SOL/signal",
      evidenceLevel: "verifier",
    },
  ],
  "persona-anime": [
    {
      tierId: "tier-anime-trust",
      pricingType: "subscription_unlimited",
      price: "0.02 SOL/mo",
      evidenceLevel: "trust",
    },
    {
      tierId: "tier-anime-verifier",
      pricingType: "per_signal",
      price: "0.001 SOL/signal",
      evidenceLevel: "verifier",
    },
  ],
};

export const fallbackPersonaDetails: PersonaDetail[] = fallbackPersonas.map((persona) => ({
  ...persona,
  description: `Signals for ${persona.name} with maker-defined tiers.`,
  tiers: fallbackTiers[persona.id] ?? [],
}));

export const fallbackRequests: RequestSummary[] = [
  {
    id: "req-eth",
    title: "ETH best price across 5 venues",
    budget: "0.1 SOL/mo",
    latency: "<3s",
    evidence: "Verifier",
  },
  {
    id: "req-anime",
    title: "Anime episode releases with timestamps",
    budget: "0.02 SOL/mo",
    latency: "<10s",
    evidence: "Trust",
  },
];

export function getFallbackPersona(id: string): PersonaDetail | null {
  const base = fallbackPersonas.find((p) => p.id === id);
  if (!base) return null;
  return {
    ...base,
    description: `Signals for ${base.name} with maker-defined tiers.`,
    tiers: fallbackTiers[id] ?? [],
  };
}
