import { SocialFi } from "socialfi";

export type TapestryConfig = {
  apiKey: string;
  baseURL?: string;
};

export type CreateProfileInput = {
  walletAddress: string;
  username: string;
  bio?: string;
  id?: string;
  properties?: { key: string; value: string | number | boolean }[];
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type UpdateProfileInput = {
  profileId: string;
  username?: string;
  bio?: string;
  image?: string;
  properties?: { key: string; value: string | number | boolean }[];
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type ListProfilesInput = {
  walletAddress?: string;
  page?: number;
  pageSize?: number;
};

export type CreateContentInput = {
  profileId: string;
  properties: { key: string; value: string | number | boolean }[];
  id?: string;
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type FollowInput = {
  startId: string;
  endId: string;
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type CreateCommentInput = {
  profileId: string;
  contentId: string;
  text: string;
  id?: string;
  properties?: { key: string; value: string | number | boolean }[];
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type CreateLikeInput = {
  profileId: string;
  contentId: string;
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type ListContentsInput = {
  filterField?: string;
  filterValue?: string;
  requireFields?: string;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
  page?: number;
  pageSize?: number;
  profileId?: string;
  requestingProfileId?: string;
};

export type UpdateContentInput = {
  contentId: string;
  properties: { key: string; value: string | number | boolean }[];
};

export type ListFollowingInput = {
  profileId: string;
  page?: number;
  pageSize?: number;
};

export type ListContentsResponse = {
  contents: Array<{
    content?: Record<string, any> | null;
    socialCounts?: { likeCount?: number; commentCount?: number };
    authorProfile?: {
      id?: string;
      username?: string;
      bio?: string | null;
      image?: string | null;
      namespace?: string;
      created_at?: number;
    };
    requestingProfileSocialInfo?: { hasLiked?: boolean };
  }>;
  page?: number;
  pageSize?: number;
  totalCount?: number;
};

export class TapestryClient {
  private client: SocialFi;
  private apiKey: string;
  private baseURL: string;

  constructor(cfg: TapestryConfig) {
    this.apiKey = cfg.apiKey;
    this.baseURL = (cfg.baseURL ?? "https://api.usetapestry.dev/v1/").replace(/\/$/, "");
    this.client = new SocialFi({
      baseURL: this.baseURL,
      apiKey: cfg.apiKey,
    });
  }

  private buildUrl(path: string) {
    return `${this.baseURL}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async createProfile(input: CreateProfileInput) {
    return this.client.profiles.findOrCreateCreate(
      { apiKey: this.apiKey },
      {
        walletAddress: input.walletAddress,
        username: input.username,
        id: input.id,
        bio: input.bio,
        blockchain: "SOLANA",
        execution: input.execution ?? "FAST_UNCONFIRMED",
        properties: input.properties,
      }
    );
  }

  async updateProfile(input: UpdateProfileInput) {
    const customProperties: { key: string; value: string | number | boolean }[] = [];
    if (input.bio !== undefined) customProperties.push({ key: "bio", value: input.bio });
    if (input.image !== undefined) customProperties.push({ key: "profileImage", value: input.image });
    if (input.properties?.length) {
      customProperties.push(...input.properties);
    }
    if (customProperties.length === 0) {
      return { profileId: input.profileId };
    }

    const res = await fetch(`${this.buildUrl("/profiles/update")}?apiKey=${encodeURIComponent(this.apiKey)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profileId: input.profileId,
        customProperties,
        blockchain: "SOLANA",
        execution: input.execution ?? "FAST_UNCONFIRMED",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tapestry update profile failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async updateProfileCore(input: UpdateProfileInput) {
    const payload: Record<string, any> = {};
    if (input.username !== undefined) payload.username = input.username;
    if (input.bio !== undefined) payload.bio = input.bio;
    if (input.image !== undefined) payload.image = input.image;
    if (input.properties !== undefined) payload.properties = input.properties;
    if (input.execution !== undefined) payload.execution = input.execution;
    return this.client.profiles.profilesUpdate({ apiKey: this.apiKey, id: input.profileId }, payload);
  }

  async listProfiles(input: ListProfilesInput) {
    return this.client.profiles.profilesList({
      apiKey: this.apiKey,
      walletAddress: input.walletAddress,
      page: input.page ? String(input.page) : undefined,
      pageSize: input.pageSize ? String(input.pageSize) : undefined,
    });
  }

  async findUserProfileByWallet(walletAddress: string) {
    const entries = await this.searchProfilesByWallet(walletAddress, 20);
    for (const entry of entries) {
      const id = entry?.profile?.id;
      if (!id) continue;
      const isStream = await this.isStreamProfile(id);
      if (!isStream) {
        return {
          profile: entry.profile,
          wallet: entry.wallet,
          namespace: entry.namespace,
        };
      }
    }
    return null;
  }

  async searchProfilesByWallet(walletAddress: string, limit = 20, offset = 0) {
    const pageSize = Math.max(1, limit);
    const page = Math.floor(offset / pageSize) + 1;
    const res = await this.listProfiles({ walletAddress, page, pageSize });
    return res?.profiles ?? [];
  }

  async isStreamProfile(profileId: string): Promise<boolean> {
    const res = await this.listContents({
      profileId,
      filterField: "type",
      filterValue: "stream",
      orderByField: "created_at",
      orderByDirection: "DESC",
      pageSize: 1,
    });
    return (res?.contents?.length ?? 0) > 0;
  }

  async follow(input: FollowInput) {
    return this.client.followers.postFollowers(
      { apiKey: this.apiKey },
      {
        startId: input.startId,
        endId: input.endId,
        blockchain: "SOLANA",
        execution: input.execution ?? "FAST_UNCONFIRMED",
      }
    );
  }

  async createContent(input: CreateContentInput) {
    return this.client.contents.findOrCreateCreate(
      { apiKey: this.apiKey },
      {
        profileId: input.profileId,
        id: input.id,
        properties: input.properties,
        blockchain: "SOLANA",
        execution: input.execution ?? "FAST_UNCONFIRMED",
      }
    );
  }

  async createComment(input: CreateCommentInput) {
    return this.client.comments.commentsCreate(
      { apiKey: this.apiKey },
      {
        contentId: input.contentId,
        profileId: input.profileId,
        text: input.text,
        commentId: input.id,
        properties: input.properties,
      }
    );
  }

  async getCommentDetails(commentId: string) {
    return this.client.comments.commentsDetail({ apiKey: this.apiKey, id: commentId });
  }

  async deleteComment(commentId: string) {
    return this.client.comments.commentsDelete({ apiKey: this.apiKey, id: commentId });
  }

  async getCommentsByContent(contentId: string) {
    return this.client.comments.commentsList({ apiKey: this.apiKey, contentId });
  }

  async createLike(input: CreateLikeInput) {
    return this.client.likes.likesCreate(
      { apiKey: this.apiKey, nodeId: input.contentId },
      { startId: input.profileId }
    );
  }

  async deleteLike(input: CreateLikeInput) {
    return this.client.likes.likesDelete(
      { apiKey: this.apiKey, nodeId: input.contentId },
      { startId: input.profileId }
    );
  }

  async deleteContent(contentId: string) {
    return this.client.contents.contentsDelete({ apiKey: this.apiKey, id: contentId });
  }

  async getContentDetails(contentId: string) {
    return this.client.contents.contentsDetail({ apiKey: this.apiKey, id: contentId });
  }

  async updateContent(input: UpdateContentInput) {
    return this.client.contents.contentsUpdate(
      { apiKey: this.apiKey, id: input.contentId },
      { properties: input.properties }
    );
  }

  async listContents(input: ListContentsInput): Promise<ListContentsResponse> {
    return this.client.contents.contentsList({
      apiKey: this.apiKey,
      orderByField: input.orderByField,
      orderByDirection: input.orderByDirection,
      requireFields: input.requireFields,
      filterField: input.filterField,
      filterValue: input.filterValue,
      page: input.page ? String(input.page) : undefined,
      pageSize: input.pageSize ? String(input.pageSize) : undefined,
      profileId: input.profileId,
      requestingProfileId: input.requestingProfileId,
    }) as unknown as ListContentsResponse;
  }

  async getProfileDetails(profileId: string) {
    return this.client.profiles.profilesDetail({ apiKey: this.apiKey, id: profileId });
  }

  async getProfileSocialCounts(profileId: string): Promise<{ followers: number; following: number }> {
    const details = await this.getProfileDetails(profileId);
    const counts = details?.socialCounts;
    return {
      followers: counts?.followers ?? 0,
      following: counts?.following ?? 0,
    };
  }

  async listFollowing(input: ListFollowingInput) {
    return this.client.profiles.followingList({
      apiKey: this.apiKey,
      id: input.profileId,
      page: input.page ? String(input.page) : undefined,
      pageSize: input.pageSize ? String(input.pageSize) : undefined,
    });
  }
}
