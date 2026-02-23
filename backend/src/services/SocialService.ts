import { SocialPost, SocialPostType } from "../social/SocialPostStore";
import { UserStore } from "../social/UserStore";
import { TapestryClient } from "../tapestry/TapestryClient";
import { randomUUID } from "node:crypto";

const TAPESTRY_TIMEOUT_MS = 30_000;

export type CreateIntentInput = {
  wallet: string;
  content: string;
  streamId?: string;
  tags?: string[];
  topic?: string;
  displayName?: string;
};

export type CreateSlashInput = {
  wallet: string;
  content: string;
  streamId?: string;
  makerWallet?: string;
  challengeTx?: string;
  severity?: string;
  displayName?: string;
};

export class SocialService {
  constructor(
    private client: TapestryClient,
    private users: UserStore
  ) {}

  async ensureProfile(wallet: string, displayName?: string) {
    const user = await this.users.getUser(wallet);
    if (user?.tapestryProfileId) {
      return user.tapestryProfileId;
    }
    const username =
      displayName?.replace(/\s+/g, "-").toLowerCase() ?? `stream-${wallet.slice(0, 6)}`;
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
      ...(input.streamId ? [{ key: "streamId", value: input.streamId }] : []),
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
    const post = {
      id: resolvedId,
      type: "intent",
      contentId: resolvedId,
      profileId,
      authorWallet: input.wallet,
      content: input.content,
      customProperties: toPropertyMap(properties),
      createdAt: Date.now(),
    };
    return post;
  }

  async createSlashReport(input: CreateSlashInput) {
    const profileId = await this.ensureProfile(input.wallet, input.displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    const properties = [
      { key: "type", value: "slash" },
      { key: "text", value: input.content },
      ...(input.streamId ? [{ key: "streamId", value: input.streamId }] : []),
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
    const post = {
      id: resolvedId,
      type: "slash",
      contentId: resolvedId,
      profileId,
      authorWallet: input.wallet,
      content: input.content,
      customProperties: toPropertyMap(properties),
      createdAt: Date.now(),
    };
    return post;
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
      TAPESTRY_TIMEOUT_MS
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
      TAPESTRY_TIMEOUT_MS
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
    return this._rawFetchPostsWithCounts(type, limit);
  }

  /** Raw Tapestry fetch. */
  private async _rawFetchPostsWithCounts(type?: SocialPostType, limit = 50) {
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
    const sorted = posts.sort((a, b) => b.createdAt - a.createdAt);
    const trimmed = limit ? sorted.slice(0, limit) : sorted;
    return { posts: trimmed, likeCounts, commentCounts };
  }

  async addComment(wallet: string, contentId: string, comment: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    try {
      const result = await this.client.createComment({ profileId, contentId, text: comment });
      return result;
    } catch (err: any) {
      if (err?.message?.includes("404") || err?.status === 404) {
        await new Promise((r) => setTimeout(r, 1200));
        const result = await this.client.createComment({ profileId, contentId, text: comment });
        return result;
      }
      throw err;
    }
  }

  getComments(contentId: string) {
    return this.client.getCommentsByContent(contentId);
  }

  async like(wallet: string, contentId: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    try {
      const result = await this.client.createLike({ profileId, contentId });
      return result;
    } catch (err: any) {
      // Profile may not be propagated yet (FAST_UNCONFIRMED timing) — retry once
      if (err?.message?.includes("404") || err?.status === 404) {
        await new Promise((r) => setTimeout(r, 1200));
        const result = await this.client.createLike({ profileId, contentId });
        return result;
      }
      throw err;
    }
  }

  async follow(wallet: string, targetProfileId: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    if (profileId === targetProfileId) {
      throw new Error("Cannot follow self");
    }
    try {
      return await this.client.follow({ startId: profileId, endId: targetProfileId });
    } catch (err: any) {
      if (err?.message?.includes("404") || err?.status === 404) {
        await new Promise((r) => setTimeout(r, 1200));
        return this.client.follow({ startId: profileId, endId: targetProfileId });
      }
      throw err;
    }
  }

  async unlike(wallet: string, contentId: string, displayName?: string) {
    const profileId = await this.ensureProfile(wallet, displayName);
    if (!profileId) {
      throw new Error("Unable to create Tapestry profile");
    }
    const result = await this.client.deleteLike({ profileId, contentId });
    return result;
  }

  async getPost(contentId: string): Promise<SocialPost | null> {
    const details = await this.client.getContentDetails(contentId);
    if (!details) return null;
    return mapTapestryEntryToPost(details);
  }

  async getLikes(contentId: string): Promise<number> {
    const details = await this.client.getContentDetails(contentId);
    return details?.socialCounts?.likeCount ?? 0;
  }

  /**
   * Start background polling. Call once on server startup.
   * @param intervalMs How often to poll Tapestry for the main feed (default 15 s).
   */
  startBackgroundRefresh(intervalMs = 15_000): void {
    void intervalMs;
  }

  /** Stop all background pollers and clear the cache. Call on server shutdown. */
  stopBackgroundRefresh(): void {
  }

  private async listTapestryPosts(type?: SocialPostType, limit = 50) {
    const entries = await this.fetchTapestryContents(type, limit);
    const posts = entries.map(mapTapestryEntryToPost).filter(Boolean) as SocialPost[];
    const sorted = posts.sort((a, b) => b.createdAt - a.createdAt);
    return limit ? sorted.slice(0, limit) : sorted;
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
        TAPESTRY_TIMEOUT_MS
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
      TAPESTRY_TIMEOUT_MS
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
