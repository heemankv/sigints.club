import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SubscriptionQuery, SubscriptionRecord, SubscriptionStore } from "./SubscriptionStore";

export class FileSubscriptionStore implements SubscriptionStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "subscriptions.json");
  }

  async createSubscription(
    input: Omit<SubscriptionRecord, "id" | "createdAt">
  ): Promise<SubscriptionRecord> {
    const subs = await this.readAll();
    const record: SubscriptionRecord = {
      ...input,
      id: `sub-${randomUUID()}`,
      createdAt: Date.now(),
    };
    subs.push(record);
    await this.writeAll(subs);
    return record;
  }

  async listSubscriptions(query: SubscriptionQuery = {}): Promise<SubscriptionRecord[]> {
    const subs = await this.readAll();
    return subs.filter((s) => {
      if (query.listenerWallet && s.listenerWallet !== query.listenerWallet) return false;
      if (query.botId && s.botId !== query.botId) return false;
      return true;
    });
  }

  private async readAll(): Promise<SubscriptionRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SubscriptionRecord[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: SubscriptionRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
