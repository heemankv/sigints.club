type Property = { key: string; value: string | number | boolean };

type Profile = {
  id: string;
  walletAddress: string;
  username: string;
  bio?: string;
  properties?: Property[];
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

  async getContentDetails(contentId: string) {
    const likeCount = this.likes.get(contentId)?.size ?? 0;
    const commentCount = this.comments.get(contentId)?.length ?? 0;
    return { socialCounts: { likeCount, commentCount } };
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
    return profile ? { profile } : null;
  }

  async listFollowing(input: { profileId: string; page?: number; pageSize?: number }) {
    const following = Array.from(this.follows.get(input.profileId) ?? []);
    const profiles = following.map((id) => ({ id }));
    return { profiles };
  }
}
