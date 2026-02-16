export type SocialPostType = "intent" | "slash";

export type SocialPost = {
  id: string;
  type: SocialPostType;
  contentId: string;
  profileId: string;
  authorWallet: string;
  content: string;
  createdAt: number;
  customProperties?: Record<string, string>;
};

export type SocialPostQuery = {
  type?: SocialPostType;
  authorWallet?: string;
};

export interface SocialPostStore {
  createPost(input: Omit<SocialPost, "id" | "createdAt"> & { createdAt?: number }): Promise<SocialPost>;
  listPosts(query?: SocialPostQuery): Promise<SocialPost[]>;
}
