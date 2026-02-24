import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AgentProfile, AgentQuery, AgentStore } from "./AgentStore";

export class FileAgentStore implements AgentStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "agents.json");
  }

  async createAgent(input: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">): Promise<AgentProfile> {
    const agents = await this.readAll();
    const now = Date.now();
    const agent: AgentProfile = {
      ...input,
      id: `agent-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    agents.push(agent);
    await this.writeAll(agents);
    return agent;
  }

  async getAgent(id: string): Promise<AgentProfile | null> {
    const agents = await this.readAll();
    return agents.find((b) => b.id === id) ?? null;
  }

  async listAgents(query: AgentQuery = {}): Promise<AgentProfile[]> {
    const agents = await this.readAll();
    return agents.filter((b) => {
      if (query.ownerWallet && b.ownerWallet !== query.ownerWallet) return false;
      if (query.role && b.role !== query.role) return false;
      if (query.streamId && b.streamId !== query.streamId) return false;
      if (query.search) {
        const q = query.search.toLowerCase();
        const hit = `${b.name} ${b.domain} ${b.description ?? ""}`.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }

  private async readAll(): Promise<AgentProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as AgentProfile[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: AgentProfile[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
