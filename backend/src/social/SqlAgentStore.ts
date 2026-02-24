import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AgentProfile, AgentQuery, AgentStore } from "./AgentStore";

function rowToAgent(row: any): AgentProfile {
  return {
    id: String(row.id),
    ownerWallet: String(row.owner_wallet),
    name: String(row.name),
    role: row.role,
    streamId: row.stream_id ?? undefined,
    domain: String(row.domain),
    description: row.description ?? undefined,
    evidence: row.evidence,
    tiers: row.tiers ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class SqlAgentStore implements AgentStore {
  constructor(private db: Pool) {}

  async createAgent(
    input: Omit<AgentProfile, "id" | "createdAt" | "updatedAt">
  ): Promise<AgentProfile> {
    const now = Date.now();
    const agent: AgentProfile = {
      ...input,
      id: `agent-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    const res = await this.db.query(
      `INSERT INTO agents (
        id, owner_wallet, name, role, stream_id, domain, description, evidence, tiers, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        agent.id,
        agent.ownerWallet,
        agent.name,
        agent.role,
        agent.streamId ?? null,
        agent.domain,
        agent.description ?? null,
        agent.evidence,
        agent.tiers ?? null,
        agent.createdAt,
        agent.updatedAt,
      ]
    );
    return rowToAgent(res.rows[0]);
  }

  async getAgent(id: string): Promise<AgentProfile | null> {
    const res = await this.db.query("SELECT * FROM agents WHERE id = $1", [id]);
    return res.rows[0] ? rowToAgent(res.rows[0]) : null;
  }

  async listAgents(query: AgentQuery = {}): Promise<AgentProfile[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (query.ownerWallet) {
      values.push(query.ownerWallet);
      conditions.push(`owner_wallet = $${values.length}`);
    }
    if (query.role) {
      values.push(query.role);
      conditions.push(`role = $${values.length}`);
    }
    if (query.streamId) {
      values.push(query.streamId);
      conditions.push(`stream_id = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(name) LIKE $${values.length}
        OR LOWER(domain) LIKE $${values.length}
        OR LOWER(COALESCE(description, '')) LIKE $${values.length}
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.db.query(`SELECT * FROM agents ${where} ORDER BY created_at DESC`, values);
    return res.rows.map(rowToAgent);
  }
}
