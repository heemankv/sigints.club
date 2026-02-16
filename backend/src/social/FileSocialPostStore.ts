import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SocialPost, SocialPostQuery, SocialPostStore } from "./SocialPostStore";

export class FileSocialPostStore implements SocialPostStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "social_posts.json");
  }

  async createPost(
    input: Omit<SocialPost, "id" | "createdAt"> & { createdAt?: number }
  ): Promise<SocialPost> {
    const posts = await this.readAll();
    const now = input.createdAt ?? Date.now();
    const post: SocialPost = {
      ...input,
      id: `post-${randomUUID()}`,
      createdAt: now,
    };
    posts.push(post);
    await this.writeAll(posts);
    return post;
  }

  async listPosts(query: SocialPostQuery = {}): Promise<SocialPost[]> {
    const posts = await this.readAll();
    return posts
      .filter((p) => {
        if (query.type && p.type !== query.type) return false;
        if (query.authorWallet && p.authorWallet !== query.authorWallet) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private async readAll(): Promise<SocialPost[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SocialPost[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: SocialPost[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
