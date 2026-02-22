// Canonical shared types for the sigints.club frontend.
// All components must import from here — never redefine locally.

export type SocialPost = {
  id: string;
  type: "intent" | "slash";
  contentId: string;
  profileId: string;
  authorWallet: string;
  content: string;
  createdAt: number;
  customProperties?: Record<string, string>;
};

// The API returns a polymorphic comment shape; this union captures all variants.
export type CommentEntry = {
  id?: string;
  comment?: string;
  content?: string | { text?: string };
  text?: string;
  profileId?: string;
  createdAt?: number;
};

export type StreamTier = {
  tierId: string;
  pricingType: string;
  price: string;
  quota?: string;
  evidenceLevel: string;
};

export type StreamDetail = {
  id: string;
  name: string;
  domain: string;
  description?: string;
  evidence: string;
  accuracy?: string;
  latency?: string;
  price?: string;
  onchainAddress?: string;
  authority?: string;
  dao?: string;
  tapestryProfileId?: string;
  tiers: StreamTier[];
};

export type BotProfile = {
  id: string;
  name: string;
  domain: string;
  description?: string;
  role: string;
  evidence: string;
};
