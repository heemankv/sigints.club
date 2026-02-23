import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { SubscriptionQuery, SubscriptionRecord, SubscriptionStore } from "./SubscriptionStore";

function rowToSubscription(row: any): SubscriptionRecord {
  return {
    id: String(row.id),
    listenerWallet: String(row.listener_wallet),
    botId: String(row.bot_id),
    tierId: String(row.tier_id),
    pricingType: row.pricing_type,
    evidenceLevel: row.evidence_level,
    createdAt: Number(row.created_at),
    onchainTx: row.onchain_tx ?? undefined,
  };
}

export class SqlSubscriptionStore implements SubscriptionStore {
  constructor(private db: Pool) {}

  async createSubscription(
    input: Omit<SubscriptionRecord, "id" | "createdAt">
  ): Promise<SubscriptionRecord> {
    const record: SubscriptionRecord = {
      ...input,
      id: `sub-${randomUUID()}`,
      createdAt: Date.now(),
    };
    const res = await this.db.query(
      `INSERT INTO subscriptions (
        id, listener_wallet, bot_id, tier_id, pricing_type, evidence_level, created_at, onchain_tx
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        record.id,
        record.listenerWallet,
        record.botId,
        record.tierId,
        record.pricingType,
        record.evidenceLevel,
        record.createdAt,
        record.onchainTx ?? null,
      ]
    );
    return rowToSubscription(res.rows[0]);
  }

  async listSubscriptions(query: SubscriptionQuery = {}): Promise<SubscriptionRecord[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (query.listenerWallet) {
      values.push(query.listenerWallet);
      conditions.push(`listener_wallet = $${values.length}`);
    }
    if (query.botId) {
      values.push(query.botId);
      conditions.push(`bot_id = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.db.query(`SELECT * FROM subscriptions ${where} ORDER BY created_at DESC`, values);
    return res.rows.map(rowToSubscription);
  }
}
