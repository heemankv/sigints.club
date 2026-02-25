// Typed API layer for social endpoints (SDK-backed).
// All social data fetching goes through here — no raw fetchJson/postJson in components.

import {
  fetchFeed as sdkFetchFeed,
  fetchFollowingFeed as sdkFetchFollowingFeed,
  fetchTrendingFeed as sdkFetchTrendingFeed,
  fetchPost as sdkFetchPost,
  createIntent as sdkCreateIntent,
  createSlashReport as sdkCreateSlashReport,
  addLike as sdkAddLike,
  removeLike as sdkRemoveLike,
  fetchLikeCount as sdkFetchLikeCount,
  fetchFollowCounts as sdkFetchFollowCounts,
  fetchFollowingIds as sdkFetchFollowingIds,
  fetchComments as sdkFetchComments,
  addComment as sdkAddComment,
  deleteComment as sdkDeleteComment,
  followProfile as sdkFollowProfile,
  deletePost as sdkDeletePost,
  searchAgents as sdkSearchAgents,
  loginUser as sdkLoginUser,
  type LoginUserResponse,
} from "../sdkBackend";
import type { SocialPost, CommentEntry, AgentProfile } from "../types";

// ─── Feed ─────────────────────────────────────────────────────────────────────

type FeedResponse = {
  posts: SocialPost[];
  likeCounts?: Record<string, number>;
  commentCounts?: Record<string, number>;
};

const FEED_CACHE_KEY = "feed_cache_v1";
const FEED_CACHE_TTL_MS = 30_000;

type FeedCache = {
  expiresAt: number;
  data: FeedResponse;
};

export function readFeedCache(): FeedResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedCache;
    if (!parsed?.data || !Array.isArray(parsed.data.posts)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeFeedCache(data: FeedResponse) {
  if (typeof window === "undefined") return;
  try {
    const payload: FeedCache = {
      data,
      expiresAt: Date.now() + FEED_CACHE_TTL_MS,
    };
    window.localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export async function fetchFeed(type?: "intent" | "slash"): Promise<FeedResponse> {
  const data = await sdkFetchFeed<FeedResponse>(type);
  writeFeedCache(data);
  return data;
}

export async function fetchFollowingFeed(
  wallet: string,
  type?: "intent" | "slash"
): Promise<FeedResponse> {
  return sdkFetchFollowingFeed<FeedResponse>(wallet, type);
}

export async function fetchTrendingFeed(limit = 6): Promise<FeedResponse> {
  return sdkFetchTrendingFeed<FeedResponse>(limit);
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function fetchPost(
  contentId: string
): Promise<{ post: SocialPost; likeCount?: number }> {
  return sdkFetchPost<{ post: SocialPost; likeCount?: number }>(contentId);
}

export async function createIntent(params: {
  wallet: string;
  content: string;
  topic?: string;
  tags?: string[];
}): Promise<void> {
  await sdkCreateIntent(params);
}

export async function createSlashReport(params: {
  wallet: string;
  content: string;
  streamId?: string;
  makerWallet?: string;
  challengeTx?: string;
}): Promise<void> {
  await sdkCreateSlashReport(params);
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function addLike(wallet: string, contentId: string): Promise<void> {
  await sdkAddLike(wallet, contentId);
}

export async function removeLike(wallet: string, contentId: string): Promise<void> {
  await sdkRemoveLike(wallet, contentId);
}

export async function fetchLikeCount(contentId: string): Promise<number> {
  return sdkFetchLikeCount(contentId);
}

export async function fetchFollowCounts(
  wallet: string
): Promise<{ counts: { followers: number; following: number } }> {
  return sdkFetchFollowCounts(wallet);
}

// ─── Following ───────────────────────────────────────────────────────────────

const FOLLOWING_CACHE_KEY = "following_cache_v1";
const FOLLOWING_CACHE_TTL_MS = 30_000;

type FollowingCache = {
  wallet: string;
  following: string[];
  expiresAt: number;
};

export function readFollowingCache(wallet: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FOLLOWING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FollowingCache;
    if (!parsed?.following || !Array.isArray(parsed.following)) return null;
    if (parsed.wallet !== wallet) return null;
    return parsed.following;
  } catch {
    return null;
  }
}

function writeFollowingCache(wallet: string, following: string[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: FollowingCache = {
      wallet,
      following,
      expiresAt: Date.now() + FOLLOWING_CACHE_TTL_MS,
    };
    window.localStorage.setItem(FOLLOWING_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export async function fetchFollowingIds(
  wallet: string
): Promise<{ following: string[] }> {
  const data = await sdkFetchFollowingIds(wallet);
  writeFollowingCache(wallet, data.following ?? []);
  return data;
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
  return sdkFetchComments<CommentsResponse>(contentId, page, pageSize);
}

export async function addComment(
  wallet: string,
  contentId: string,
  comment: string
): Promise<void> {
  await sdkAddComment(wallet, contentId, comment);
}

export async function deleteComment(wallet: string, commentId: string): Promise<void> {
  await sdkDeleteComment(wallet, commentId);
}

// ─── Follow ───────────────────────────────────────────────────────────────────

export async function followProfile(wallet: string, targetProfileId: string): Promise<void> {
  await sdkFollowProfile(wallet, targetProfileId);
}

export async function deletePost(wallet: string, contentId: string): Promise<void> {
  await sdkDeletePost(wallet, contentId);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchAgents(query: string): Promise<{ agents: AgentProfile[] }> {
  return sdkSearchAgents<{ agents: AgentProfile[] }>(query);
}

// ─── User / Auth ──────────────────────────────────────────────────────────────

export async function loginUser(
  wallet: string,
  opts?: { displayName?: string; bio?: string }
): Promise<LoginUserResponse> {
  return sdkLoginUser(wallet, opts);
}
