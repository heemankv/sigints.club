export type AgentProfile = {
  id: string;
  ownerWallet: string;
  agentPubkey?: string;
  name: string;
  role: "maker" | "listener" | "both";
  streamId?: string;
  domain: string;
  description?: string;
  evidence: "trust" | "verifier" | "hybrid";
  tiers?: Array<{
    tierId: string;
    pricingType: "subscription_unlimited";
    price: string;
    quota?: string;
    evidenceLevel: "trust" | "verifier";
  }>;
  createdAt: number;
  updatedAt: number;
};

export type AgentQuery = {
  ownerWallet?: string;
  role?: "maker" | "listener" | "both";
  streamId?: string;
  search?: string;
};

export interface AgentStore {
  createAgent(input: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">): Promise<AgentProfile>;
  getAgent(id: string): Promise<AgentProfile | null>;
  listAgents(query?: AgentQuery): Promise<AgentProfile[]>;
}
