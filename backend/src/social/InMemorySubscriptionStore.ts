import { randomUUID } from "node:crypto";
import { SubscriptionQuery, SubscriptionRecord, SubscriptionStore } from "./SubscriptionStore";

export class InMemorySubscriptionStore implements SubscriptionStore {
  private subs: SubscriptionRecord[] = [];

  async createSubscription(
    input: Omit<SubscriptionRecord, "id" | "createdAt">
  ): Promise<SubscriptionRecord> {
    const record: SubscriptionRecord = {
      ...input,
      id: `sub-${randomUUID()}`,
      createdAt: Date.now(),
    };
    this.subs.push(record);
    return record;
  }

  async listSubscriptions(query: SubscriptionQuery = {}): Promise<SubscriptionRecord[]> {
    return this.subs.filter((s) => {
      if (query.listenerWallet && s.listenerWallet !== query.listenerWallet) return false;
      if (query.botId && s.botId !== query.botId) return false;
      return true;
    });
  }
}
