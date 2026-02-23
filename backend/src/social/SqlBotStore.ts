import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { BotProfile, BotQuery, BotStore } from "./BotStore";

function rowToBot(row: any): BotProfile {
  return {
    id: String(row.id),
    ownerWallet: String(row.owner_wallet),
    name: String(row.name),
    role: row.role,
    domain: String(row.domain),
    description: row.description ?? undefined,
    evidence: row.evidence,
    tiers: row.tiers ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class SqlBotStore implements BotStore {
  constructor(private db: Pool) {}

  async createBot(input: Omit<BotProfile, "id" | "createdAt" | "updatedAt">): Promise<BotProfile> {
    const now = Date.now();
    const bot: BotProfile = {
      ...input,
      id: `bot-${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    const res = await this.db.query(
      `INSERT INTO bots (
        id, owner_wallet, name, role, domain, description, evidence, tiers, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        bot.id,
        bot.ownerWallet,
        bot.name,
        bot.role,
        bot.domain,
        bot.description ?? null,
        bot.evidence,
        bot.tiers ?? null,
        bot.createdAt,
        bot.updatedAt,
      ]
    );
    return rowToBot(res.rows[0]);
  }

  async getBot(id: string): Promise<BotProfile | null> {
    const res = await this.db.query("SELECT * FROM bots WHERE id = $1", [id]);
    return res.rows[0] ? rowToBot(res.rows[0]) : null;
  }

  async listBots(query: BotQuery = {}): Promise<BotProfile[]> {
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
    if (query.search) {
      values.push(`%${query.search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(name) LIKE $${values.length}
        OR LOWER(domain) LIKE $${values.length}
        OR LOWER(COALESCE(description, '')) LIKE $${values.length}
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.db.query(`SELECT * FROM bots ${where} ORDER BY created_at DESC`, values);
    return res.rows.map(rowToBot);
  }
}
