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
  comment?: string | { id?: string; created_at?: number; text?: string };
  content?: string | { text?: string };
  text?: string | { text?: string };
  author?: { id?: string; username?: string };
  profileId?: string;
  createdAt?: number;
  created_at?: number;
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
  visibility?: "public" | "private";
  evidence: string;
  accuracy?: string;
  latency?: string;
  price?: string;
  createdAt?: number;
  onchainAddress?: string;
  authority?: string;
  dao?: string;
  tapestryProfileId?: string;
  tiers: StreamTier[];
};

export type SignalEvent = {
  id: number;
  streamId: string;
  tierId: string;
  signalHash: string;
  visibility: "public" | "private";
  createdAt: number;
  onchainTx?: string;
};

export type OnChainSubscription = {
  subscription: string;
  subscriber: string;
  stream: string;
  tierIdHex: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAt: number;
  quotaRemaining: number;
  status: number;
  nftMint: string;
};

export type AgentProfile = {
  id: string;
  ownerWallet: string;
  agentPubkey?: string;
  name: string;
  domain: string;
  description?: string;
  role: "maker" | "listener";
  streamId?: string;
  evidence: "trust" | "verifier" | "hybrid";
  tiers?: StreamTier[];
};

export type AgentSubscription = {
  id: string;
  ownerWallet: string;
  agentId: string;
  streamId: string;
  tierId: string;
  pricingType: "subscription_unlimited";
  evidenceLevel: "trust" | "verifier";
  visibility?: "public" | "private";
  createdAt: number;
  updatedAt: number;
  onchainTx?: string;
};
