import { randomUUID } from "node:crypto";
import { AgentProfile, AgentQuery, AgentStore } from "./AgentStore";

export class InMemoryAgentStore implements AgentStore {
  private agents: AgentProfile[] = [];

  async createAgent(input: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">): Promise<AgentProfile> {
    const now = Date.now();
    const agent: AgentProfile = {
      ...input,
      id: `agent-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    this.agents.push(agent);
    return agent;
  }

  async getAgent(id: string): Promise<AgentProfile | null> {
    return this.agents.find((b) => b.id === id) ?? null;
  }

  async listAgents(query: AgentQuery = {}): Promise<AgentProfile[]> {
    return this.agents.filter((b) => {
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
}
