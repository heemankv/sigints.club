export type StreamTier = {
  tierId: string;
  pricingType: "subscription_unlimited";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

export type StreamProfile = {
  id: string;
  name: string;
  domain: string;
  description: string;
  visibility?: "public" | "private";
  evidence: string;
  accuracy: string;
  latency: string;
  price: string;
  tiers: StreamTier[];
  ownerWallet: string;
  tapestryProfileId?: string;
  createdAt: number;
  updatedAt: number;
};

export interface StreamStore {
  listStreams(): Promise<StreamProfile[]>;
  getStream(id: string): Promise<StreamProfile | null>;
  upsertStream(input: Omit<StreamProfile, "createdAt" | "updatedAt">): Promise<StreamProfile>;
}
