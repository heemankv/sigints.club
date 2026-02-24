import { promises as fs } from "node:fs";
import path from "node:path";
import { UserProfile, UserStore } from "./UserStore";

export class FileUserStore implements UserStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "users.json");
  }

  async upsertUser(wallet: string, profile: Partial<UserProfile> = {}): Promise<UserProfile> {
    const users = await this.readAll();
    const now = Date.now();
    const existing = users.find((u) => u.wallet === wallet);
    if (existing) {
      const updated: UserProfile = {
        ...existing,
        ...profile,
        wallet,
        updatedAt: now,
      };
      const next = users.map((u) => (u.wallet === wallet ? updated : u));
      await this.writeAll(next);
      return updated;
    }
    const created: UserProfile = {
      wallet,
      displayName: profile.displayName,
      bio: profile.bio,
      tapestryProfileId: profile.tapestryProfileId,
      walletKeyRegisteredAt: profile.walletKeyRegisteredAt,
      walletKeyPublicKey: profile.walletKeyPublicKey,
      createdAt: now,
      updatedAt: now,
    };
    users.push(created);
    await this.writeAll(users);
    return created;
  }

  async getUser(wallet: string): Promise<UserProfile | null> {
    const users = await this.readAll();
    return users.find((u) => u.wallet === wallet) ?? null;
  }

  async updateUser(wallet: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    const users = await this.readAll();
    const existing = users.find((u) => u.wallet === wallet);
    if (!existing) {
      return null;
    }
    const updated: UserProfile = {
      ...existing,
      ...updates,
      wallet,
      updatedAt: Date.now(),
    };
    await this.writeAll(users.map((u) => (u.wallet === wallet ? updated : u)));
    return updated;
  }

  async listUsers(): Promise<UserProfile[]> {
    return this.readAll();
  }

  private async readAll(): Promise<UserProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as UserProfile[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: UserProfile[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
