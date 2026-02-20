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

  constructor(cfg: TapestryConfig) {
    this.apiKey = cfg.apiKey;
    this.client = new SocialFi({
      baseURL: cfg.baseURL ?? "https://tapestry-server-prod.fly.dev/api/v1",
      apiKey: cfg.apiKey,
    });
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

  async listFollowing(input: ListFollowingInput) {
    return this.client.profiles.followingList({
      apiKey: this.apiKey,
      id: input.profileId,
      page: input.page ? String(input.page) : undefined,
      pageSize: input.pageSize ? String(input.pageSize) : undefined,
    });
  }
}
