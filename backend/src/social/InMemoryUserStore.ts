import { UserProfile, UserStore } from "./UserStore";

export class InMemoryUserStore implements UserStore {
  private users: UserProfile[] = [];

  async upsertUser(wallet: string, profile: Partial<UserProfile> = {}): Promise<UserProfile> {
    const now = Date.now();
    const existing = this.users.find((u) => u.wallet === wallet);
    if (existing) {
      const updated: UserProfile = {
        ...existing,
        ...profile,
        wallet,
        updatedAt: now,
      };
      this.users = this.users.map((u) => (u.wallet === wallet ? updated : u));
      return updated;
    }
    const created: UserProfile = {
      wallet,
      displayName: profile.displayName,
      bio: profile.bio,
      tapestryProfileId: profile.tapestryProfileId,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(created);
    return created;
  }

  async getUser(wallet: string): Promise<UserProfile | null> {
    return this.users.find((u) => u.wallet === wallet) ?? null;
  }

  async updateUser(wallet: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    const existing = this.users.find((u) => u.wallet === wallet);
    if (!existing) {
      return null;
    }
    const updated: UserProfile = {
      ...existing,
      ...updates,
      wallet,
      updatedAt: Date.now(),
    };
    this.users = this.users.map((u) => (u.wallet === wallet ? updated : u));
    return updated;
  }

  async listUsers(): Promise<UserProfile[]> {
    return this.users;
  }
}
