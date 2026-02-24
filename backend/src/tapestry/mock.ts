type Property = { key: string; value: string | number | boolean };

type Profile = {
  id: string;
  walletAddress: string;
  username: string;
  bio?: string;
  properties?: Property[];
  image?: string;
  created_at: number;
};

type Content = {
  id: string;
  profileId: string;
  properties: Property[];
  created_at: number;
};

type Comment = {
  id: string;
  profileId: string;
  contentId: string;
  text: string;
  created_at: number;
};

function propsToObject(properties: Property[]): Record<string, any> {
  return properties.reduce<Record<string, any>>((acc, prop) => {
    acc[prop.key] = prop.value;
    return acc;
  }, {});
}

export class MockTapestryClient {
  private profiles = new Map<string, Profile>();
  private contents = new Map<string, Content>();
  private follows = new Map<string, Set<string>>();
  private likes = new Map<string, Set<string>>();
  private comments = new Map<string, Comment[]>();

  async createProfile(input: {
    walletAddress: string;
    username: string;
    bio?: string;
    id?: string;
    properties?: Property[];
  }) {
    const id = input.id ?? input.username;
    if (!this.profiles.has(id)) {
      this.profiles.set(id, {
        id,
        walletAddress: input.walletAddress,
        username: input.username,
        bio: input.bio,
        properties: input.properties,
        created_at: Date.now(),
      });
    }
    return { profile: { id } };
  }

  async updateProfile(input: {
    profileId: string;
    username?: string;
    bio?: string;
    image?: string;
    properties?: Property[];
  }) {
    const existing = this.profiles.get(input.profileId);
    if (existing) {
      if (input.username !== undefined) existing.username = input.username;
      if (input.bio !== undefined) existing.bio = input.bio;
      if (input.image !== undefined) existing.image = input.image;
      if (input.properties !== undefined) existing.properties = input.properties;
      return { ...existing };
    }
    return null;
  }

  async listProfiles(input: { walletAddress?: string; page?: number | string; pageSize?: number | string }) {
    let items = Array.from(this.profiles.values());
    if (input.walletAddress) {
      items = items.filter((p) => p.walletAddress === input.walletAddress);
    }
    const pageSize = Number(input.pageSize ?? 50);
    const page = Number(input.page ?? 1);
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);

    const profiles = slice.map((profile) => ({
      profile,
      wallet: { address: profile.walletAddress },
    }));
    return { profiles, page, pageSize, totalCount: items.length };
  }

  async findUserProfileByWallet(walletAddress: string) {
    const res = await this.listProfiles({ walletAddress, page: 1, pageSize: 20 });
    const entries = res?.profiles ?? [];
    for (const entry of entries) {
      const id = entry?.profile?.id;
      if (!id) continue;
      const isStream = await this.isStreamProfile(id);
      if (!isStream) return entry;
    }
    const fallback = entries?.[0];
    if (!fallback?.profile) return null;
    return fallback;
  }

  async isStreamProfile(profileId: string): Promise<boolean> {
    for (const content of this.contents.values()) {
      if (content.profileId !== profileId) continue;
      const props = propsToObject(content.properties);
      if (props.type === "stream") return true;
    }
    return false;
  }

  async follow(input: { startId: string; endId: string }) {
    if (!this.follows.has(input.startId)) {
      this.follows.set(input.startId, new Set());
    }
    this.follows.get(input.startId)!.add(input.endId);
    return { success: true };
  }

  async createContent(input: { profileId: string; properties: Property[]; id?: string }) {
    const id = input.id ?? `content-${Math.random().toString(36).slice(2, 10)}`;
    if (!this.contents.has(id)) {
      this.contents.set(id, {
        id,
        profileId: input.profileId,
        properties: input.properties,
        created_at: Date.now(),
      });
    }
    return { content: { id } };
  }

  async updateContent(input: { contentId: string; properties: Property[] }) {
    const existing = this.contents.get(input.contentId);
    if (existing) {
      existing.properties = input.properties;
    }
    return { content: { id: input.contentId } };
  }

  async createComment(input: { profileId: string; contentId: string; text: string; id?: string }) {
    const id = input.id ?? `comment-${Math.random().toString(36).slice(2, 10)}`;
    const list = this.comments.get(input.contentId) ?? [];
    list.push({
      id,
      profileId: input.profileId,
      contentId: input.contentId,
      text: input.text,
      created_at: Date.now(),
    });
    this.comments.set(input.contentId, list);
    return { comment: { id } };
  }

  async getCommentDetails(commentId: string) {
    for (const list of this.comments.values()) {
      const found = list.find((item) => item.id === commentId);
      if (!found) continue;
      const author = this.profiles.get(found.profileId);
      return {
        comment: { id: found.id, created_at: found.created_at, text: found.text },
        contentId: found.contentId,
        author: author
          ? {
              id: author.id,
              username: author.username,
              bio: author.bio ?? null,
              created_at: author.created_at,
              namespace: "mock",
            }
          : { id: found.profileId, username: found.profileId, created_at: found.created_at, namespace: "mock" },
        socialCounts: { likeCount: 0 },
      };
    }
    return null;
  }

  async deleteComment(commentId: string) {
    for (const [contentId, list] of this.comments.entries()) {
      const next = list.filter((item) => item.id !== commentId);
      if (next.length !== list.length) {
        this.comments.set(contentId, next);
        return { success: true };
      }
    }
    return { success: false };
  }

  async getCommentsByContent(contentId: string) {
    return { comments: this.comments.get(contentId) ?? [] };
  }

  async createLike(input: { profileId: string; contentId: string }) {
    if (!this.likes.has(input.contentId)) {
      this.likes.set(input.contentId, new Set());
    }
    this.likes.get(input.contentId)!.add(input.profileId);
    return { success: true };
  }

  async deleteLike(input: { profileId: string; contentId: string }) {
    this.likes.get(input.contentId)?.delete(input.profileId);
    return { success: true };
  }

  async deleteContent(contentId: string) {
    this.contents.delete(contentId);
    this.comments.delete(contentId);
    this.likes.delete(contentId);
    return { success: true };
  }

  async getContentDetails(contentId: string) {
    const likeCount = this.likes.get(contentId)?.size ?? 0;
    const commentCount = this.comments.get(contentId)?.length ?? 0;
    const content = this.contents.get(contentId);
    const author = content ? this.profiles.get(content.profileId) : undefined;
    return {
      content: content
        ? { id: content.id, created_at: content.created_at, namespace: "mock" }
        : null,
      socialCounts: { likeCount, commentCount },
      authorProfile: author
        ? {
            id: author.id,
            username: author.username,
            bio: author.bio ?? null,
            created_at: author.created_at,
            namespace: "mock",
          }
        : undefined,
    };
  }

  async listContents(input: {
    filterField?: string;
    filterValue?: string;
    orderByField?: string;
    orderByDirection?: "ASC" | "DESC";
    page?: number | string;
    pageSize?: number | string;
    profileId?: string;
    requestingProfileId?: string;
  }) {
    let items = Array.from(this.contents.values());
    if (input.profileId) {
      items = items.filter((c) => c.profileId === input.profileId);
    }
    if (input.filterField && input.filterValue) {
      items = items.filter((c) => {
        const props = propsToObject(c.properties);
        return String(props[input.filterField!]) === String(input.filterValue);
      });
    }
    items = items.sort((a, b) => b.created_at - a.created_at);
    const pageSize = Number(input.pageSize ?? 50);
    const page = Number(input.page ?? 1);
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);

    const contents = slice.map((c) => {
      const props = propsToObject(c.properties);
      const likeCount = this.likes.get(c.id)?.size ?? 0;
      const commentCount = this.comments.get(c.id)?.length ?? 0;
      const profile = this.profiles.get(c.profileId);
      return {
        content: {
          id: c.id,
          created_at: c.created_at,
          namespace: "mock",
          ...props,
        },
        socialCounts: { likeCount, commentCount },
        authorProfile: profile
          ? {
              id: profile.id,
              username: profile.username,
              bio: profile.bio ?? null,
              created_at: profile.created_at,
            }
          : undefined,
        requestingProfileSocialInfo: input.requestingProfileId
          ? { hasLiked: this.likes.get(c.id)?.has(input.requestingProfileId) ?? false }
          : undefined,
      };
    });

    return { contents, page, pageSize, totalCount: items.length };
  }

  async getProfileDetails(profileId: string) {
    const profile = this.profiles.get(profileId);
    const followers = Array.from(this.follows.values()).filter((set) => set.has(profileId)).length;
    const following = this.follows.get(profileId)?.size ?? 0;
    return profile
      ? {
          profile,
          socialCounts: {
            followers,
            following,
          },
        }
      : null;
  }

  async listFollowing(input: { profileId: string; page?: number; pageSize?: number }) {
    const following = Array.from(this.follows.get(input.profileId) ?? []);
    const profiles = following.map((id) => ({ id }));
    return { profiles };
  }
}
