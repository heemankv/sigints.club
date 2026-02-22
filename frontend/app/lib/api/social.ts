// Typed API layer for social endpoints.
// All social data fetching goes through here — no raw fetchJson/postJson in components.

import { fetchJson, postJson, deleteJson } from "../api";
import type { SocialPost, CommentEntry, BotProfile } from "../types";

// ─── Feed ─────────────────────────────────────────────────────────────────────

type FeedResponse = {
  posts: SocialPost[];
  likeCounts?: Record<string, number>;
  commentCounts?: Record<string, number>;
};

export async function fetchFeed(type?: "intent" | "slash"): Promise<FeedResponse> {
  const query = type ? `?type=${type}` : "";
  return fetchJson<FeedResponse>(`/social/feed${query}`);
}

export async function fetchFollowingFeed(
  wallet: string,
  type?: "intent" | "slash"
): Promise<FeedResponse> {
  const query = type ? `&type=${type}` : "";
  return fetchJson<FeedResponse>(
    `/social/feed?scope=following&wallet=${encodeURIComponent(wallet)}${query}`
  );
}

export async function fetchTrendingFeed(limit = 6): Promise<FeedResponse> {
  return fetchJson<FeedResponse>(`/social/feed/trending?limit=${limit}`);
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function fetchPost(
  contentId: string
): Promise<{ post: SocialPost; likeCount?: number }> {
  return fetchJson<{ post: SocialPost; likeCount?: number }>(
    `/social/posts/${encodeURIComponent(contentId)}`
  );
}

export async function createIntent(params: {
  wallet: string;
  content: string;
  topic?: string;
  tags?: string[];
}): Promise<void> {
  await postJson("/social/intents", params);
}

export async function createSlashReport(params: {
  wallet: string;
  content: string;
  streamId?: string;
  makerWallet?: string;
  challengeTx?: string;
}): Promise<void> {
  await postJson("/social/slash", params);
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function addLike(wallet: string, contentId: string): Promise<void> {
  await postJson("/social/likes", { wallet, contentId });
}

export async function removeLike(wallet: string, contentId: string): Promise<void> {
  await deleteJson("/social/likes", { wallet, contentId });
}

export async function fetchLikeCount(contentId: string): Promise<number> {
  const data = await fetchJson<{ count: number }>(
    `/social/likes?contentId=${encodeURIComponent(contentId)}`
  );
  return data.count;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

type CommentsResponse = {
  comments: CommentEntry[];
  total?: number;
  page?: number;
};

export async function fetchComments(
  contentId: string,
  page = 1,
  pageSize = 3
): Promise<CommentsResponse> {
  return fetchJson<CommentsResponse>(
    `/social/comments?contentId=${encodeURIComponent(contentId)}&page=${page}&pageSize=${pageSize}`
  );
}

export async function addComment(
  wallet: string,
  contentId: string,
  comment: string
): Promise<void> {
  await postJson("/social/comments", { wallet, contentId, comment });
}

// ─── Follow ───────────────────────────────────────────────────────────────────

export async function followProfile(wallet: string, targetProfileId: string): Promise<void> {
  await postJson("/social/follow", { wallet, targetProfileId });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchBots(query: string): Promise<{ bots: BotProfile[] }> {
  return fetchJson<{ bots: BotProfile[] }>(`/bots?search=${encodeURIComponent(query)}`);
}

// ─── User / Auth ──────────────────────────────────────────────────────────────

export async function loginUser(wallet: string): Promise<void> {
  await postJson("/users/login", { wallet });
}
