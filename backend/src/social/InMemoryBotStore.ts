import { randomUUID } from "node:crypto";
import { BotProfile, BotQuery, BotStore } from "./BotStore";

export class InMemoryBotStore implements BotStore {
  private bots: BotProfile[] = [];

  async createBot(input: Omit<BotProfile, "id" | "createdAt" | "updatedAt">): Promise<BotProfile> {
    const now = Date.now();
    const bot: BotProfile = {
      ...input,
      id: `bot-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    this.bots.push(bot);
    return bot;
  }

  async getBot(id: string): Promise<BotProfile | null> {
    return this.bots.find((b) => b.id === id) ?? null;
  }

  async listBots(query: BotQuery = {}): Promise<BotProfile[]> {
    return this.bots.filter((b) => {
      if (query.ownerWallet && b.ownerWallet !== query.ownerWallet) return false;
      if (query.role && b.role !== query.role) return false;
      if (query.search) {
        const q = query.search.toLowerCase();
        const hit = `${b.name} ${b.domain} ${b.description ?? ""}`.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }
}
