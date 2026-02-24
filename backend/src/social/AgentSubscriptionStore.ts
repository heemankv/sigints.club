export type AgentSubscriptionRecord = {
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

export type AgentSubscriptionQuery = {
  ownerWallet?: string;
  agentId?: string;
  streamId?: string;
};

export interface AgentSubscriptionStore {
  createAgentSubscription(
    input: Omit<AgentSubscriptionRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<AgentSubscriptionRecord>;
  listAgentSubscriptions(query?: AgentSubscriptionQuery): Promise<AgentSubscriptionRecord[]>;
  deleteAgentSubscription(id: string): Promise<boolean>;
}
