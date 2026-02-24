import type { Pool } from "pg";
import { UserProfile, UserStore } from "./UserStore";

function rowToUser(row: any): UserProfile {
  return {
    wallet: String(row.wallet_address),
    displayName: row.display_name ?? undefined,
    bio: row.bio ?? undefined,
    tapestryProfileId: row.tapestry_profile_id ?? undefined,
    walletKeyRegisteredAt: row.wallet_key_registered_at != null ? Number(row.wallet_key_registered_at) : undefined,
    walletKeyPublicKey: row.wallet_key_public_key ?? undefined,
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
      walletKeyRegisteredAt: profile.walletKeyRegisteredAt ?? existing?.walletKeyRegisteredAt,
      walletKeyPublicKey: profile.walletKeyPublicKey ?? existing?.walletKeyPublicKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const res = await this.db.query(
      `INSERT INTO users (
        wallet_address, display_name, bio, tapestry_profile_id, wallet_key_registered_at, wallet_key_public_key, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (wallet_address) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        tapestry_profile_id = EXCLUDED.tapestry_profile_id,
        wallet_key_registered_at = EXCLUDED.wallet_key_registered_at,
        wallet_key_public_key = EXCLUDED.wallet_key_public_key,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        merged.wallet,
        merged.displayName ?? null,
        merged.bio ?? null,
        merged.tapestryProfileId ?? null,
        merged.walletKeyRegisteredAt ?? null,
        merged.walletKeyPublicKey ?? null,
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
      walletKeyRegisteredAt: updates.walletKeyRegisteredAt ?? existing.walletKeyRegisteredAt,
      walletKeyPublicKey: updates.walletKeyPublicKey ?? existing.walletKeyPublicKey,
      updatedAt: now,
    };
    const res = await this.db.query(
      `UPDATE users SET
        display_name = $2,
        bio = $3,
        tapestry_profile_id = $4,
        wallet_key_registered_at = $5,
        wallet_key_public_key = $6,
        updated_at = $7
      WHERE wallet_address = $1
      RETURNING *`,
      [
        wallet,
        merged.displayName ?? null,
        merged.bio ?? null,
        merged.tapestryProfileId ?? null,
        merged.walletKeyRegisteredAt ?? null,
        merged.walletKeyPublicKey ?? null,
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
