import type { Pool } from "pg";
import { UserProfile, UserStore } from "./UserStore";

function rowToUser(row: any): UserProfile {
  return {
    wallet: String(row.wallet_address),
    displayName: row.display_name ?? undefined,
    bio: row.bio ?? undefined,
    tapestryProfileId: row.tapestry_profile_id ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class SqlUserStore implements UserStore {
  constructor(private db: Pool) {}

  async upsertUser(wallet: string, profile: Partial<UserProfile> = {}): Promise<UserProfile> {
    const existing = await this.getUser(wallet);
    const now = Date.now();
    const merged: UserProfile = {
      wallet,
      displayName: profile.displayName ?? existing?.displayName,
      bio: profile.bio ?? existing?.bio,
      tapestryProfileId: profile.tapestryProfileId ?? existing?.tapestryProfileId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const res = await this.db.query(
      `INSERT INTO users (
        wallet_address, display_name, bio, tapestry_profile_id, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (wallet_address) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        tapestry_profile_id = EXCLUDED.tapestry_profile_id,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        merged.wallet,
        merged.displayName ?? null,
        merged.bio ?? null,
        merged.tapestryProfileId ?? null,
        merged.createdAt,
        merged.updatedAt,
      ]
    );
    return rowToUser(res.rows[0]);
  }

  async getUser(wallet: string): Promise<UserProfile | null> {
    const res = await this.db.query(
      "SELECT * FROM users WHERE wallet_address = $1",
      [wallet]
    );
    if (!res.rows[0]) return null;
    return rowToUser(res.rows[0]);
  }

  async updateUser(wallet: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    const existing = await this.getUser(wallet);
    if (!existing) return null;
    const now = Date.now();
    const merged: UserProfile = {
      ...existing,
      displayName: updates.displayName ?? existing.displayName,
      bio: updates.bio ?? existing.bio,
      tapestryProfileId: updates.tapestryProfileId ?? existing.tapestryProfileId,
      updatedAt: now,
    };
    const res = await this.db.query(
      `UPDATE users SET
        display_name = $2,
        bio = $3,
        tapestry_profile_id = $4,
        updated_at = $5
      WHERE wallet_address = $1
      RETURNING *`,
      [
        wallet,
        merged.displayName ?? null,
        merged.bio ?? null,
        merged.tapestryProfileId ?? null,
        merged.updatedAt,
      ]
    );
    return res.rows[0] ? rowToUser(res.rows[0]) : null;
  }

  async listUsers(): Promise<UserProfile[]> {
    const res = await this.db.query("SELECT * FROM users");
    return res.rows.map(rowToUser);
  }
}
