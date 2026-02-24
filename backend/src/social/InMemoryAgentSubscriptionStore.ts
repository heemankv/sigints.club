import { randomUUID } from "node:crypto";
import {
  AgentSubscriptionQuery,
  AgentSubscriptionRecord,
  AgentSubscriptionStore,
} from "./AgentSubscriptionStore";

export class InMemoryAgentSubscriptionStore implements AgentSubscriptionStore {
  private subs: AgentSubscriptionRecord[] = [];

  async createAgentSubscription(
    input: Omit<AgentSubscriptionRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<AgentSubscriptionRecord> {
    const now = Date.now();
    const record: AgentSubscriptionRecord = {
      ...input,
      id: `sub-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    this.subs.push(record);
    return record;
  }

  async listAgentSubscriptions(
    query: AgentSubscriptionQuery = {}
  ): Promise<AgentSubscriptionRecord[]> {
    return this.subs.filter((s) => {
      if (query.ownerWallet && s.ownerWallet !== query.ownerWallet) return false;
      if (query.agentId && s.agentId !== query.agentId) return false;
      if (query.streamId && s.streamId !== query.streamId) return false;
      return true;
    });
  }

  async deleteAgentSubscription(id: string): Promise<boolean> {
    const next = this.subs.filter((s) => s.id !== id);
    if (next.length === this.subs.length) return false;
    this.subs = next;
    return true;
  }
}
