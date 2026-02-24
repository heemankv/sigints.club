import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AgentSubscriptionQuery,
  AgentSubscriptionRecord,
  AgentSubscriptionStore,
} from "./AgentSubscriptionStore";

export class FileAgentSubscriptionStore implements AgentSubscriptionStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "agent_subscriptions.json");
  }

  async createAgentSubscription(
    input: Omit<AgentSubscriptionRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<AgentSubscriptionRecord> {
    const subs = await this.readAll();
    const now = Date.now();
    const record: AgentSubscriptionRecord = {
      ...input,
      id: `sub-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    subs.push(record);
    await this.writeAll(subs);
    return record;
  }

  async listAgentSubscriptions(
    query: AgentSubscriptionQuery = {}
  ): Promise<AgentSubscriptionRecord[]> {
    const subs = await this.readAll();
    return subs.filter((s) => {
      if (query.ownerWallet && s.ownerWallet !== query.ownerWallet) return false;
      if (query.agentId && s.agentId !== query.agentId) return false;
      if (query.streamId && s.streamId !== query.streamId) return false;
      return true;
    });
  }

  async deleteAgentSubscription(id: string): Promise<boolean> {
    const subs = await this.readAll();
    const next = subs.filter((s) => s.id !== id);
    if (next.length === subs.length) return false;
    await this.writeAll(next);
    return true;
  }

  private async readAll(): Promise<AgentSubscriptionRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as AgentSubscriptionRecord[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: AgentSubscriptionRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
