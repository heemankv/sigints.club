import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  AgentSubscriptionQuery,
  AgentSubscriptionRecord,
  AgentSubscriptionStore,
} from "./AgentSubscriptionStore";

function rowToSubscription(row: any): AgentSubscriptionRecord {
  return {
    id: String(row.id),
    ownerWallet: String(row.owner_wallet),
    agentId: String(row.agent_id),
    streamId: String(row.stream_id),
    tierId: String(row.tier_id),
    pricingType: row.pricing_type,
    evidenceLevel: row.evidence_level,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    visibility: row.visibility ?? undefined,
    onchainTx: row.onchain_tx ?? undefined,
  };
}

export class SqlAgentSubscriptionStore implements AgentSubscriptionStore {
  constructor(private db: Pool) {}

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
    const res = await this.db.query(
      `INSERT INTO agent_subscriptions (
        id, owner_wallet, agent_id, stream_id, tier_id, pricing_type, evidence_level, created_at, updated_at, visibility, onchain_tx
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        record.id,
        record.ownerWallet,
        record.agentId,
        record.streamId,
        record.tierId,
        record.pricingType,
        record.evidenceLevel,
        record.createdAt,
        record.updatedAt,
        record.visibility ?? null,
        record.onchainTx ?? null,
      ]
    );
    return rowToSubscription(res.rows[0]);
  }

  async listAgentSubscriptions(
    query: AgentSubscriptionQuery = {}
  ): Promise<AgentSubscriptionRecord[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (query.ownerWallet) {
      values.push(query.ownerWallet);
      conditions.push(`owner_wallet = $${values.length}`);
    }
    if (query.agentId) {
      values.push(query.agentId);
      conditions.push(`agent_id = $${values.length}`);
    }
    if (query.streamId) {
      values.push(query.streamId);
      conditions.push(`stream_id = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.db.query(
      `SELECT * FROM agent_subscriptions ${where} ORDER BY created_at DESC`,
      values
    );
    return res.rows.map(rowToSubscription);
  }

  async deleteAgentSubscription(id: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM agent_subscriptions WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
