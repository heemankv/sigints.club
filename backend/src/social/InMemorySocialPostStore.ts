import { randomUUID } from "node:crypto";
import { SocialPost, SocialPostQuery, SocialPostStore } from "./SocialPostStore";

export class InMemorySocialPostStore implements SocialPostStore {
  private posts: SocialPost[] = [];

  async createPost(
    input: Omit<SocialPost, "id" | "createdAt"> & { createdAt?: number }
  ): Promise<SocialPost> {
    const now = input.createdAt ?? Date.now();
    const post: SocialPost = {
      ...input,
      id: `post-${randomUUID()}`,
      createdAt: now,
    };
    this.posts.push(post);
    return post;
  }

  async listPosts(query: SocialPostQuery = {}): Promise<SocialPost[]> {
    return this.posts
      .filter((p) => {
        if (query.type && p.type !== query.type) return false;
        if (query.authorWallet && p.authorWallet !== query.authorWallet) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
