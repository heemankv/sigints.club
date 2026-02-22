export type SubscriptionRecord = {
  id: string;
  listenerWallet: string;
  botId: string;
  tierId: string;
  pricingType: "subscription_unlimited";
  evidenceLevel: string;
  createdAt: number;
  onchainTx?: string;
};

export type SubscriptionQuery = {
  listenerWallet?: string;
  botId?: string;
};

export interface SubscriptionStore {
  createSubscription(input: Omit<SubscriptionRecord, "id" | "createdAt">): Promise<SubscriptionRecord>;
  listSubscriptions(query?: SubscriptionQuery): Promise<SubscriptionRecord[]>;
}
