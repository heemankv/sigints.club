import type { Pool } from "pg";
import { WrappedKey } from "../crypto/hybrid";
import { SignalMetadata } from "../metadata/MetadataStore";
import { SignalStore, SignalEvent, PublicSignalPayload, PrivateSignalPayload, SignalPayload } from "./SignalStore";

function rowToMetadata(row: any): SignalMetadata {
  const visibility = row.visibility as "public" | "private";
  const signalHash = String(row.signal_hash);
  const keyboxHash = row.keybox_hash ? String(row.keybox_hash) : null;
  const signalPointer = `backend://${visibility === "public" ? "public" : "ciphertext"}/${signalHash}`;
  const keyboxPointer = keyboxHash ? `backend://keybox/${keyboxHash}` : null;

  return {
    streamId: String(row.stream_id),
    tierId: String(row.tier_id),
    signalHash,
    signalPointer,
    keyboxHash,
    keyboxPointer,
    visibility,
    createdAt: Number(row.created_at),
    onchainTx: row.onchain_tx ?? undefined,
  };
}

function rowToEvent(row: any): SignalEvent {
  return {
    id: Number(row.id),
    streamId: String(row.stream_id),
    tierId: String(row.tier_id),
    signalHash: String(row.signal_hash),
    visibility: row.visibility as "public" | "private",
    createdAt: Number(row.created_at),
    onchainTx: row.onchain_tx ?? undefined,
  };
}

export class SqlSignalStore implements SignalStore {
  constructor(private db: Pool) {}

  async upsertPublicSignal(meta: SignalMetadata, payload: PublicSignalPayload): Promise<void> {
    const now = Date.now();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO signals_latest (
          stream_id, tier_id, visibility, signal_hash, payload_json, keybox_hash, created_at, updated_at, onchain_tx
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (stream_id) DO UPDATE SET
          tier_id = EXCLUDED.tier_id,
          visibility = EXCLUDED.visibility,
          signal_hash = EXCLUDED.signal_hash,
          payload_json = EXCLUDED.payload_json,
          keybox_hash = EXCLUDED.keybox_hash,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          onchain_tx = EXCLUDED.onchain_tx`,
        [
          meta.streamId,
          meta.tierId,
          meta.visibility ?? "public",
          meta.signalHash,
          payload,
          null,
          meta.createdAt,
          now,
          meta.onchainTx ?? null,
        ]
      );
      await client.query(
        `INSERT INTO signals_events (
          stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          meta.streamId,
          meta.tierId,
          meta.visibility ?? "public",
          meta.signalHash,
          meta.createdAt,
          meta.onchainTx ?? null,
        ]
      );
      await client.query("DELETE FROM keyboxes_latest WHERE stream_id = $1", [meta.streamId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertPrivateSignal(
    meta: SignalMetadata,
    payload: PrivateSignalPayload,
    keybox: Record<string, WrappedKey>
  ): Promise<void> {
    if (!meta.keyboxHash) {
      throw new Error("keyboxHash required for private signals");
    }
    const now = Date.now();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO signals_latest (
          stream_id, tier_id, visibility, signal_hash, payload_json, keybox_hash, created_at, updated_at, onchain_tx
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (stream_id) DO UPDATE SET
          tier_id = EXCLUDED.tier_id,
          visibility = EXCLUDED.visibility,
          signal_hash = EXCLUDED.signal_hash,
          payload_json = EXCLUDED.payload_json,
          keybox_hash = EXCLUDED.keybox_hash,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          onchain_tx = EXCLUDED.onchain_tx`,
        [
          meta.streamId,
          meta.tierId,
          meta.visibility ?? "private",
          meta.signalHash,
          payload,
          meta.keyboxHash,
          meta.createdAt,
          now,
          meta.onchainTx ?? null,
        ]
      );

      await client.query(
        `INSERT INTO signals_events (
          stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          meta.streamId,
          meta.tierId,
          meta.visibility ?? "private",
          meta.signalHash,
          meta.createdAt,
          meta.onchainTx ?? null,
        ]
      );

      await client.query("DELETE FROM keyboxes_latest WHERE stream_id = $1", [meta.streamId]);

      const entries = Object.entries(keybox);
      for (const [subscriberId, wrapped] of entries) {
        await client.query(
          `INSERT INTO keyboxes_latest (
            stream_id, subscriber_id, wrapped_key_json, keybox_hash, created_at
          ) VALUES ($1,$2,$3,$4,$5)`,
          [
            meta.streamId,
            subscriberId,
            wrapped,
          meta.keyboxHash,
            meta.createdAt,
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listSignals(streamId: string): Promise<SignalMetadata[]> {
    const res = await this.db.query(
      "SELECT * FROM signals_latest WHERE stream_id = $1",
      [streamId]
    );
    return res.rows.map(rowToMetadata);
  }

  async listAllSignals(): Promise<SignalMetadata[]> {
    const res = await this.db.query("SELECT * FROM signals_latest");
    return res.rows.map(rowToMetadata);
  }

  async listSignalEvents(streamId: string, limit = 10, after?: number): Promise<SignalEvent[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    if (after) {
      const res = await this.db.query(
        `SELECT id, stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx
         FROM signals_events
         WHERE stream_id = $1 AND id > $2
         ORDER BY id ASC
         LIMIT $3`,
        [streamId, after, safeLimit]
      );
      return res.rows.map(rowToEvent);
    }
    const res = await this.db.query(
      `SELECT id, stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx
       FROM signals_events
       WHERE stream_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [streamId, safeLimit]
    );
    return res.rows.map(rowToEvent);
  }

  async listRecentSignalEvents(limit = 20, after?: number): Promise<SignalEvent[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    if (after) {
      const res = await this.db.query(
        `SELECT id, stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx
         FROM signals_events
         WHERE id > $1
         ORDER BY id ASC
         LIMIT $2`,
        [after, safeLimit]
      );
      return res.rows.map(rowToEvent);
    }
    const res = await this.db.query(
      `SELECT id, stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx
       FROM signals_events
       ORDER BY id DESC
       LIMIT $1`,
      [safeLimit]
    );
    return res.rows.map(rowToEvent);
  }

  async getSignalByHash(hash: string): Promise<SignalMetadata | null> {
    const res = await this.db.query(
      "SELECT * FROM signals_latest WHERE signal_hash = $1",
      [hash]
    );
    return res.rows[0] ? rowToMetadata(res.rows[0]) : null;
  }

  async getSignalByKeyboxHash(hash: string): Promise<SignalMetadata | null> {
    const res = await this.db.query(
      "SELECT * FROM signals_latest WHERE keybox_hash = $1",
      [hash]
    );
    return res.rows[0] ? rowToMetadata(res.rows[0]) : null;
  }

  async getPayloadByHash(hash: string): Promise<SignalPayload | null> {
    const res = await this.db.query(
      "SELECT payload_json FROM signals_latest WHERE signal_hash = $1",
      [hash]
    );
    if (!res.rows[0]) return null;
    return res.rows[0].payload_json as SignalPayload;
  }

  async getKeyboxByHash(hash: string): Promise<Record<string, WrappedKey> | null> {
    const res = await this.db.query(
      "SELECT subscriber_id, wrapped_key_json FROM keyboxes_latest WHERE keybox_hash = $1",
      [hash]
    );
    if (!res.rows.length) return null;
    const map: Record<string, WrappedKey> = {};
    for (const row of res.rows) {
      map[String(row.subscriber_id)] = row.wrapped_key_json as WrappedKey;
    }
    return map;
  }
}
