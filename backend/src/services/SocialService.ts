import { SocialPostStore, SocialPostType } from "../social/SocialPostStore";
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
    return this.posts.listPosts(type ? { type } : {});
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
}

function toPropertyMap(list: { key: string; value: string | number | boolean }[]): Record<string, string> {
  return list.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = String(item.value);
    return acc;
  }, {});
}
