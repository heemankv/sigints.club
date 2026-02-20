import { SocialPost, SocialPostStore, SocialPostType } from "../social/SocialPostStore";
import { UserStore } from "../social/UserStore";
import { TapestryClient } from "../tapestry/TapestryClient";
import { randomUUID } from "node:crypto";

export type CreateIntentInput = {
  wallet: string;
  content: string;
  personaId?: string;
  tags?: string[];
  topic?: string;
  displayName?: string;
};

export type CreateSlashInput = {
  wallet: string;
  content: string;
  personaId?: string;
  makerWallet?: string;
  challengeTx?: string;
  severity?: string;
  displayName?: string;
};

export class SocialService {
  constructor(
    private client: TapestryClient,
    private posts: SocialPostStore,
    private users: UserStore
  ) {}

  async ensureProfile(wallet: string, displayName?: string) {
    const user = await this.users.getUser(wallet);
    if (user?.tapestryProfileId) {
      return user.tapestryProfileId;
    }
    const username =
      displayName?.replace(/\s+/g, "-").toLowerCase() ?? `persona-${wallet.slice(0, 6)}`;
    const res = await this.client.createProfile({
      walletAddress: wallet,
      username,
      bio: user?.bio,
    });
    const profileId = res?.profile?.id ?? res?.data?.id ?? res?.id;
    if (profileId) {
      await this.users.upsertUser(wallet, { tapestryProfileId: profileId });
    }
    return profileId;
  }

  async createIntent(input: CreateIntentInput) {
    const profileId = await this.ensureProfile(input.wallet, input.displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    const properties = [
      { key: "type", value: "intent" },
      { key: "text", value: input.content },
      ...(input.personaId ? [{ key: "personaId", value: input.personaId }] : []),
      ...(input.topic ? [{ key: "topic", value: input.topic }] : []),
      ...(input.tags?.length ? [{ key: "tags", value: input.tags.join(",") }] : []),
      { key: "wallet", value: input.wallet },
    ];
    const contentId = `intent-${randomUUID()}`;
    const res = await this.client.createContent({
      profileId,
      id: contentId,
      properties,
    });
    const resolvedId = res?.content?.id ?? res?.data?.id ?? res?.id ?? contentId;
    if (!resolvedId) {
      throw new Error("Tapestry content creation failed");
    }
    return this.posts.createPost({
      type: "intent",
      contentId: resolvedId,
      profileId,
      authorWallet: input.wallet,
      content: input.content,
      customProperties: toPropertyMap(properties),
    });
  }

  async createSlashReport(input: CreateSlashInput) {
    const profileId = await this.ensureProfile(input.wallet, input.displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    const properties = [
      { key: "type", value: "slash" },
      { key: "text", value: input.content },
      ...(input.personaId ? [{ key: "personaId", value: input.personaId }] : []),
      ...(input.makerWallet ? [{ key: "makerWallet", value: input.makerWallet }] : []),
      ...(input.challengeTx ? [{ key: "challengeTx", value: input.challengeTx }] : []),
      ...(input.severity ? [{ key: "severity", value: input.severity }] : []),
      { key: "validatorWallet", value: input.wallet },
    ];
    const contentId = `slash-${randomUUID()}`;
    const res = await this.client.createContent({
      profileId,
      id: contentId,
      properties,
    });
    const resolvedId = res?.content?.id ?? res?.data?.id ?? res?.id ?? contentId;
    if (!resolvedId) {
      throw new Error("Tapestry content creation failed");
    }
    return this.posts.createPost({
      type: "slash",
      contentId: resolvedId,
      profileId,
      authorWallet: input.wallet,
      content: input.content,
      customProperties: toPropertyMap(properties),
    });
  }

  listPosts(type?: SocialPostType) {
    return this.listTapestryPosts(type);
  }

  async listFollowingPosts(args: {
    wallet: string;
    type?: SocialPostType;
    limit?: number;
    page?: number;
    pageSize?: number;
    displayName?: string;
  }) {
    const profileId = await this.ensureProfile(args.wallet, args.displayName);
    if (!profileId) {
      throw new Error("Unable to resolve profile for following feed");
    }
    const followRes = await withTimeout(
      this.client.listFollowing({
        profileId,
        page: args.page,
        pageSize: args.pageSize ?? 50,
      }),
      4000
    );
    const followingIds = extractFollowingProfileIds(followRes);
    if (!followingIds.length) {
      return { posts: [], likeCounts: {}, commentCounts: {} };
    }

    const limit = args.limit ?? args.pageSize ?? 50;
    const perProfile = Math.max(1, Math.ceil(limit / followingIds.length));
    const responses = await withTimeout(
      Promise.all(
        followingIds.map((id) =>
          this.client.listContents({
            profileId: id,
            filterField: args.type ? "type" : undefined,
            filterValue: args.type,
            orderByField: "created_at",
            orderByDirection: "DESC",
            pageSize: perProfile,
          })
        )
      ),
      4000
    );

    const posts: SocialPost[] = [];
    const likeCounts: Record<string, number> = {};
    const commentCounts: Record<string, number> = {};
    for (const res of responses) {
      for (const entry of res.contents ?? []) {
        const mapped = mapTapestryEntryToPost(entry);
        if (!mapped) continue;
        posts.push(mapped);
        likeCounts[mapped.contentId] = entry.socialCounts?.likeCount ?? likeCounts[mapped.contentId] ?? 0;
        commentCounts[mapped.contentId] = entry.socialCounts?.commentCount ?? commentCounts[mapped.contentId] ?? 0;
      }
    }

    const merged = posts.sort((a, b) => b.createdAt - a.createdAt);
    const trimmed = limit ? merged.slice(0, limit) : merged;
    return { posts: trimmed, likeCounts, commentCounts };
  }

  async listPostsWithCounts(type?: SocialPostType, limit = 50) {
    try {
      const entries = await this.fetchTapestryContents(type, limit);
      const posts: SocialPost[] = [];
      const likeCounts: Record<string, number> = {};
      const commentCounts: Record<string, number> = {};
      for (const entry of entries) {
        const mapped = mapTapestryEntryToPost(entry);
        if (!mapped) continue;
        posts.push(mapped);
        likeCounts[mapped.contentId] = entry.socialCounts?.likeCount ?? 0;
        commentCounts[mapped.contentId] = entry.socialCounts?.commentCount ?? 0;
      }
      const merged = await this.mergeWithLocal(posts, type, limit);
      for (const post of merged) {
        if (!(post.contentId in likeCounts)) {
          likeCounts[post.contentId] = 0;
        }
        if (!(post.contentId in commentCounts)) {
          commentCounts[post.contentId] = 0;
        }
      }
      return { posts: merged, likeCounts, commentCounts };
    } catch (error) {
      const fallback = await this.posts.listPosts(type ? { type } : {});
      const trimmed = limit ? fallback.slice(0, limit) : fallback;
      return { posts: trimmed, likeCounts: {}, commentCounts: {} };
    }
  }

  async addComment(wallet: string, contentId: string, comment: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    return this.client.createComment({ profileId, contentId, text: comment });
  }

  getComments(contentId: string) {
    return this.client.getCommentsByContent(contentId);
  }

  async like(wallet: string, contentId: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    return this.client.createLike({ profileId, contentId });
  }

  async follow(wallet: string, targetProfileId: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    if (profileId === targetProfileId) {
      throw new Error("Cannot follow self");
    }
    return this.client.follow({ startId: profileId, endId: targetProfileId });
  }

  async unlike(wallet: string, contentId: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    return this.client.deleteLike({ profileId, contentId });
  }

  async getLikes(contentId: string): Promise<number> {
    const details = await this.client.getContentDetails(contentId);
    return details?.socialCounts?.likeCount ?? 0;
  }

  private async listTapestryPosts(type?: SocialPostType, limit = 50) {
    try {
      const entries = await this.fetchTapestryContents(type, limit);
      const posts = entries.map(mapTapestryEntryToPost).filter(Boolean) as SocialPost[];
      return this.mergeWithLocal(posts, type, limit);
    } catch (error) {
      return this.posts.listPosts(type ? { type } : {});
    }
  }

  private async mergeWithLocal(posts: SocialPost[], type?: SocialPostType, limit = 50) {
    const local = await this.posts.listPosts(type ? { type } : {});
    const map = new Map<string, SocialPost>();
    for (const post of posts) {
      map.set(post.contentId, post);
    }
    const now = Date.now();
    for (const post of local) {
      if (map.has(post.contentId)) continue;
      if (now - post.createdAt > 5 * 60 * 1000) continue;
      map.set(post.contentId, post);
    }
    const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    return limit ? merged.slice(0, limit) : merged;
  }

  private async fetchTapestryContents(type?: SocialPostType, limit = 50) {
    if (type) {
      const response = await withTimeout(
        this.client.listContents({
          filterField: "type",
          filterValue: type,
          orderByField: "created_at",
          orderByDirection: "DESC",
          pageSize: limit,
        }),
        4000
      );
      return response.contents ?? [];
    }

    const responses = await withTimeout(
      Promise.all([
        this.client.listContents({
          filterField: "type",
          filterValue: "intent",
          orderByField: "created_at",
          orderByDirection: "DESC",
          pageSize: limit,
        }),
        this.client.listContents({
          filterField: "type",
          filterValue: "slash",
          orderByField: "created_at",
          orderByDirection: "DESC",
          pageSize: limit,
        }),
      ]),
      4000
    );
    return responses.flatMap((res) => res.contents ?? []);
  }
}

function toPropertyMap(list: { key: string; value: string | number | boolean }[]): Record<string, string> {
  return list.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = String(item.value);
    return acc;
  }, {});
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tapestry request timed out")), timeoutMs);
  });
  try {
    return (await Promise.race([promise, timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mapTapestryEntryToPost(entry: any) {
  const content = entry?.content ?? {};
  const type = content?.type;
  if (type !== "intent" && type !== "slash") {
    return null;
  }
  const contentId = content.id ?? "";
  if (!contentId) return null;

  const createdAt = Number(content.created_at ?? Date.now());
  const text = content.text ?? "";
  const profileId = entry?.authorProfile?.id ?? "";
  const authorWallet = content.wallet ?? content.validatorWallet ?? content.makerWallet ?? "";

  const omit = new Set(["id", "created_at", "namespace", "type", "text", "externalLinkURL"]);
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(content)) {
    if (omit.has(key)) continue;
    if (value === undefined || value === null) continue;
    custom[key] = String(value);
  }

  return {
    id: contentId,
    type: type as SocialPostType,
    contentId,
    profileId,
    authorWallet,
    content: text,
    createdAt,
    customProperties: Object.keys(custom).length ? custom : undefined,
  };
}

function extractFollowingProfileIds(raw: any): string[] {
  const candidates: any[] = [];
  if (Array.isArray(raw)) candidates.push(raw);
  if (Array.isArray(raw?.following)) candidates.push(raw.following);
  if (Array.isArray(raw?.data?.following)) candidates.push(raw.data.following);
  if (Array.isArray(raw?.profiles)) candidates.push(raw.profiles);
  if (Array.isArray(raw?.data?.profiles)) candidates.push(raw.data.profiles);
  if (Array.isArray(raw?.data?.data)) candidates.push(raw.data.data);
  const ids = new Set<string>();
  for (const list of candidates) {
    for (const item of list) {
      const id =
        item?.id ??
        item?.profileId ??
        item?.profile?.id ??
        item?.endId ??
        item?.targetProfileId;
      if (id && typeof id === "string") ids.add(id);
    }
  }
  return Array.from(ids);
}
