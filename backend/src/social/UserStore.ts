export type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
  tapestryProfileId?: string;
  createdAt: number;
  updatedAt: number;
};

export interface UserStore {
  upsertUser(wallet: string, profile?: Partial<UserProfile>): Promise<UserProfile>;
  getUser(wallet: string): Promise<UserProfile | null>;
  updateUser(wallet: string, updates: Partial<UserProfile>): Promise<UserProfile | null>;
  listUsers(): Promise<UserProfile[]>;
}
