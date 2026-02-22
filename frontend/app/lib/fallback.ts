export type StreamSummary = {
  id: string;
  name: string;
  domain: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  visibility?: "public" | "private";
  tapestryProfileId?: string;
};

export type TierOption = {
  tierId: string;
  pricingType: "subscription_unlimited";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

export type StreamDetail = StreamSummary & {
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

export const fallbackStreams: StreamSummary[] = [
  {
    id: "stream-eth",
    name: "ETH-Price Scout",
    domain: "pricing",
    accuracy: "98.2%",
    latency: "1.4s",
    price: "0 SOL/mo",
    evidence: "Verifier supported",
    visibility: "public",
  },
  {
    id: "stream-amazon",
    name: "Amazon-Deal Scout",
    domain: "e-commerce",
    accuracy: "94.1%",
    latency: "3.2s",
    price: "0.08 SOL/mo",
    evidence: "Verifier supported",
    visibility: "private",
  },
  {
    id: "stream-anime",
    name: "Anime-Release Scout",
    domain: "media",
    accuracy: "99.1%",
    latency: "5.0s",
    price: "0.02 SOL/mo",
    evidence: "Trust + Verifier",
    visibility: "private",
  },
];

export const fallbackTiers: Record<string, TierOption[]> = {
  "stream-eth": [
    {
      tierId: "tier-eth-trust",
      pricingType: "subscription_unlimited",
      price: "0.05 SOL/mo",
      evidenceLevel: "trust",
    },
    {
      tierId: "tier-eth-verifier",
      pricingType: "subscription_unlimited",
      price: "0.15 SOL/mo",
      evidenceLevel: "verifier",
    },
  ],
  "stream-amazon": [
    {
      tierId: "tier-amz-trust",
      pricingType: "subscription_unlimited",
      price: "0.08 SOL/mo",
      evidenceLevel: "trust",
    },
    {
      tierId: "tier-amz-verifier",
      pricingType: "subscription_unlimited",
      price: "0.14 SOL/mo",
      evidenceLevel: "verifier",
    },
  ],
  "stream-anime": [
    {
      tierId: "tier-anime-trust",
      pricingType: "subscription_unlimited",
      price: "0.02 SOL/mo",
      evidenceLevel: "trust",
    },
    {
      tierId: "tier-anime-verifier",
      pricingType: "subscription_unlimited",
      price: "0.05 SOL/mo",
      evidenceLevel: "verifier",
    },
  ],
};

export const fallbackStreamDetails: StreamDetail[] = fallbackStreams.map((stream) => ({
  ...stream,
  description: `Signals for ${stream.name} with maker-defined tiers.`,
  tiers: fallbackTiers[stream.id] ?? [],
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

export function getFallbackStream(id: string): StreamDetail | null {
  const base = fallbackStreams.find((p) => p.id === id);
  if (!base) return null;
  return {
    ...base,
    description: `Signals for ${base.name} with maker-defined tiers.`,
    tiers: fallbackTiers[id] ?? [],
  };
}
