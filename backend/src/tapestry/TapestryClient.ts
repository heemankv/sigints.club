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
  customProperties?: { key: string; value: string }[];
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type CreateContentInput = {
  profileId: string;
  content: string;
  contentType: string;
  customProperties?: { key: string; value: string }[];
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export type FollowInput = {
  startId: string;
  endId: string;
  execution?: "FAST_UNCONFIRMED" | "QUICK_SIGNATURE" | "CONFIRMED_AND_PARSED";
};

export class TapestryClient {
  private client: SocialFi;
  private apiKey: string;

  constructor(cfg: TapestryConfig) {
    this.apiKey = cfg.apiKey;
    this.client = new SocialFi({
      baseURL: cfg.baseURL ?? "https://api.usetapestry.dev/v1/",
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
        customProperties: input.customProperties,
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
        content: input.content,
        contentType: input.contentType,
        customProperties: input.customProperties,
        blockchain: "SOLANA",
        execution: input.execution ?? "FAST_UNCONFIRMED",
      }
    );
  }
}
