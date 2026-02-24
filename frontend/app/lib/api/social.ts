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
  fetchComments as sdkFetchComments,
  addComment as sdkAddComment,
  followProfile as sdkFollowProfile,
  searchAgents as sdkSearchAgents,
  loginUser as sdkLoginUser,
} from "../sdkBackend";
import type { SocialPost, CommentEntry, AgentProfile } from "../types";

// ─── Feed ─────────────────────────────────────────────────────────────────────

type FeedResponse = {
  posts: SocialPost[];
  likeCounts?: Record<string, number>;
  commentCounts?: Record<string, number>;
};

export async function fetchFeed(type?: "intent" | "slash"): Promise<FeedResponse> {
  return sdkFetchFeed<FeedResponse>(type);
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

// ─── Follow ───────────────────────────────────────────────────────────────────

export async function followProfile(wallet: string, targetProfileId: string): Promise<void> {
  await sdkFollowProfile(wallet, targetProfileId);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchAgents(query: string): Promise<{ agents: AgentProfile[] }> {
  return sdkSearchAgents<{ agents: AgentProfile[] }>(query);
}

// ─── User / Auth ──────────────────────────────────────────────────────────────

export async function loginUser(wallet: string): Promise<void> {
  await sdkLoginUser(wallet);
}
