export type BotProfile = {
  id: string;
  ownerWallet: string;
  name: string;
  role: "maker" | "listener";
  domain: string;
  description?: string;
  evidence: "trust" | "verifier" | "hybrid";
  tiers?: Array<{
    tierId: string;
    pricingType: "subscription_limited" | "subscription_unlimited" | "per_signal";
    price: string;
    quota?: string;
    evidenceLevel: "trust" | "verifier";
  }>;
  createdAt: number;
  updatedAt: number;
};

export type BotQuery = {
  ownerWallet?: string;
  role?: "maker" | "listener";
  search?: string;
};

export interface BotStore {
  createBot(input: Omit<BotProfile, "id" | "createdAt" | "updatedAt">): Promise<BotProfile>;
  getBot(id: string): Promise<BotProfile | null>;
  listBots(query?: BotQuery): Promise<BotProfile[]>;
}
