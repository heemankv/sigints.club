import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BotProfile, BotQuery, BotStore } from "./BotStore";

export class FileBotStore implements BotStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "bots.json");
  }

  async createBot(input: Omit<BotProfile, "id" | "createdAt" | "updatedAt">): Promise<BotProfile> {
    const bots = await this.readAll();
    const now = Date.now();
    const bot: BotProfile = {
      ...input,
      id: `bot-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    bots.push(bot);
    await this.writeAll(bots);
    return bot;
  }

  async getBot(id: string): Promise<BotProfile | null> {
    const bots = await this.readAll();
    return bots.find((b) => b.id === id) ?? null;
  }

  async listBots(query: BotQuery = {}): Promise<BotProfile[]> {
    const bots = await this.readAll();
    return bots.filter((b) => {
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

  private async readAll(): Promise<BotProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as BotProfile[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: BotProfile[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
