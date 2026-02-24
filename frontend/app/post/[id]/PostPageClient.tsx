"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import type { SocialPost, CommentEntry } from "../../lib/types";
import {
  fetchPost,
  addLike,
  removeLike,
  fetchLikeCount,
  fetchComments,
  addComment,
  deleteComment,
  deletePost,
} from "../../lib/api/social";
import { POST_COMMENTS_PAGE_SIZE } from "../../lib/constants";
import { explorerTx } from "../../lib/constants";
import {
  timeAgo,
  formatFullTimestamp,
  resolveCommentText,
  resolveCommentId,
  resolveCommentAuthorId,
  resolveCommentCreatedAt,
  shortWallet,
} from "../../lib/utils";
import { useCurrentUserProfileId } from "../../hooks/useCurrentUserProfileId";

const BackArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

export default function PostPageClient({ contentId }: { contentId: string }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const currentProfileId = useCurrentUserProfileId();

  const [post, setPost] = useState<SocialPost | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentPage, setCommentPage] = useState(1);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await fetchPost(contentId);
        if (!mounted) return;
        setPost(data.post);
        setLikeCount(data.likeCount ?? 0);
      } catch (err: any) {
        if (mounted) setError(err.message ?? "Post not found");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    loadComments(1);
    return () => { mounted = false; };
  }, [contentId]);

  async function loadComments(page: number) {
    setCommentLoading(true);
    try {
      const data = await fetchComments(contentId, page, POST_COMMENTS_PAGE_SIZE);
      setComments((prev) => page === 1 ? (data.comments ?? []) : [...prev, ...(data.comments ?? [])]);
      setCommentTotal(data.total ?? data.comments?.length ?? 0);
      setCommentPage(page);
    } catch {
    } finally {
      setCommentLoading(false);
    }
  }

  async function toggleLike() {
    if (!wallet) { setStatus("Connect your wallet to vote."); return; }
    const prev = liked;
    setLiked(!prev);
    setLikeCount((n) => Math.max(0, n + (prev ? -1 : 1)));
    try {
      if (prev) {
        await removeLike(wallet, contentId);
      } else {
        await addLike(wallet, contentId);
      }
      const count = await fetchLikeCount(contentId);
      setLikeCount(count);
    } catch (err: any) {
      setLiked(prev);
      setLikeCount((n) => Math.max(0, n + (prev ? 1 : -1)));
      setStatus(err.message ?? "Vote failed");
    }
  }

  async function submitComment() {
    if (!wallet) { setStatus("Connect your wallet to reply."); return; }
    const value = commentDraft.trim();
    if (!value) return;
    const optimistic: CommentEntry = { comment: value, createdAt: Date.now() };
    setComments((prev) => [optimistic, ...prev]);
    setCommentTotal((n) => n + 1);
    setCommentDraft("");
    if (composerRef.current) composerRef.current.style.height = "auto";
    try {
      await addComment(wallet, contentId, value);
      await loadComments(1);
    } catch (err: any) {
      setComments((prev) => prev.filter((e) => e !== optimistic));
      setCommentTotal((n) => Math.max(0, n - 1));
      setStatus(err.message ?? "Comment failed");
    }
  }

  async function handleDeletePost() {
    if (!wallet) {
      setStatus("Connect your wallet to delete.");
      return;
    }
    try {
      setConfirmDeletePost(false);
      await deletePost(wallet, contentId);
      setStatus("Post deleted.");
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/feed";
        }
      }, 600);
    } catch (err: any) {
      setStatus(err?.message ?? "Delete failed");
    }
  }

  async function handleDeleteComment(entry: CommentEntry) {
    if (!wallet) {
      setStatus("Connect your wallet to delete.");
      return;
    }
    const commentId = resolveCommentId(entry);
    if (!commentId) {
      setStatus("Unable to resolve comment id.");
      return;
    }
    try {
      setConfirmDeleteCommentId(null);
      await deleteComment(wallet, commentId);
      setComments((prev) => prev.filter((item) => resolveCommentId(item) !== commentId));
      setCommentTotal((n) => Math.max(0, n - 1));
    } catch (err: any) {
      setStatus(err?.message ?? "Delete failed");
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href);
    setStatus("Link copied!");
    setTimeout(() => setStatus(null), 2000);
  }

  if (loading) {
    return (
      <div className="xview-shell">
        <div className="xview-sticky-header">
          <Link href="/feed" className="xview-back-btn" aria-label="Back"><BackArrow /></Link>
          <span className="xview-header-title">Post</span>
        </div>
        <div className="xview-post-body">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="xview-avatar shimmer" style={{ background: "var(--stroke)" }} />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              <div className="skeleton-line wide" />
              <div className="skeleton-line" style={{ width: "50%" }} />
            </div>
          </div>
          <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
            <div className="skeleton-line wide" />
            <div className="skeleton-line wide" />
            <div className="skeleton-line" style={{ width: "70%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="xview-shell">
        <div className="xview-sticky-header">
          <Link href="/feed" className="xview-back-btn" aria-label="Back"><BackArrow /></Link>
          <span className="xview-header-title">Post</span>
        </div>
        <div className="xview-empty">
          <p>{error ?? "This post could not be found."}</p>
          <Link href="/feed" className="button primary" style={{ marginTop: 16 }}>Back to feed</Link>
        </div>
      </div>
    );
  }

  const tags = post.customProperties?.tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const topic = post.customProperties?.topic;
  const streamId = post.customProperties?.streamId;
  const makerWallet = post.customProperties?.makerWallet;
  const challengeTx = post.customProperties?.challengeTx;

  const isOwnerPost =
    (wallet && post.authorWallet && post.authorWallet === wallet) ||
    (currentProfileId && post.profileId === currentProfileId);

  return (
    <div className="xview-shell">
      {/* ── Sticky header ── */}
      <div className="xview-sticky-header">
        <Link href="/feed" className="xview-back-btn" aria-label="Back"><BackArrow /></Link>
        <span className="xview-header-title">Post</span>
      </div>

      {/* ── Post body ── */}
      <div className="xview-post-body">
        <div className="xview-author-row">
          <div className="xview-avatar">{post.authorWallet[0]?.toUpperCase()}</div>
          <div className="xview-author-info">
            <span className="xview-author-name">{shortWallet(post.authorWallet)}</span>
            <span className={`xpost-type-badge ${post.type}`}>
              {post.type === "slash" ? "Slash" : "Intent"}
            </span>
          </div>
        </div>

        <p className="xview-content">{post.content}</p>

        {(tags.length > 0 || topic || streamId) && (
          <div className="xpost-tags" style={{ marginTop: 14 }}>
            {streamId && <Link className="xpost-tag" href={`/stream/${streamId}`}>#{streamId}</Link>}
            {topic && <span className="xpost-tag">#{topic}</span>}
            {tags.map((tag) => <span key={tag} className="xpost-tag">#{tag}</span>)}
          </div>
        )}

        {(makerWallet || challengeTx) && (
          <div className="xpost-meta" style={{ marginTop: 10 }}>
            {makerWallet && <span className="subtext">Maker: {makerWallet.slice(0, 10)}…</span>}
            {challengeTx && (
              <a className="link subtext" href={explorerTx(challengeTx)} target="_blank" rel="noopener noreferrer">
                Tx: {challengeTx.slice(0, 10)}…
              </a>
            )}
          </div>
        )}

        {/* Full timestamp */}
        <div className="xview-timestamp">{formatFullTimestamp(post.createdAt)}</div>

        {/* Stats */}
        <div className="xview-stats">
          <span><strong>{likeCount}</strong> Votes</span>
          <span><strong>{commentTotal}</strong> Replies</span>
        </div>

        {/* Actions */}
        <div className="xview-actions">
          <button className="xview-action reply" onClick={() => composerRef.current?.focus()} title="Reply">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{commentTotal}</span>
          </button>

          <button className={`xview-action vote${liked ? " active" : ""}`} onClick={toggleLike} title={liked ? "Unlike" : "Like"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>{likeCount}</span>
          </button>

          <button className="xview-action share" onClick={copyLink} title="Copy link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
          {isOwnerPost && (
            confirmDeletePost ? (
              <div className="confirm-toggle confirm-toggle--compact">
                <button
                  className="confirm-toggle__no"
                  onClick={() => setConfirmDeletePost(false)}
                >
                  No
                </button>
                <button
                  className="confirm-toggle__yes"
                  onClick={handleDeletePost}
                >
                  Yes
                </button>
              </div>
            ) : (
              <button className="xview-action delete" onClick={() => setConfirmDeletePost(true)} title="Delete post">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            )
          )}
        </div>
      </div>

      {status && <div className="xview-status">{status}</div>}

      {/* ── Reply composer ── */}
      <div className="xview-composer">
        <div className="xview-composer-avatar">
          {wallet ? wallet[0]?.toUpperCase() : "?"}
        </div>
        <div className="xview-composer-inner">
          <textarea
            ref={composerRef}
            className="xview-composer-input"
            placeholder={wallet ? "Post your reply…" : "Connect wallet to reply"}
            value={commentDraft}
            rows={1}
            onChange={(e) => {
              setCommentDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submitComment(); }
            }}
            disabled={!wallet}
          />
          {(commentDraft.trim() || !wallet) && (
            <div className="xview-composer-footer">
              <button
                className="xview-reply-submit"
                onClick={submitComment}
                disabled={!commentDraft.trim() || !wallet}
              >
                Reply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Replies ── */}
      <div className="xview-replies">
        {commentLoading && comments.length === 0 && (
          <div className="xview-loading-replies">Loading replies…</div>
        )}

        {comments.map((entry, idx) => {
          const authorId = resolveCommentAuthorId(entry);
          const isOwnerComment = Boolean(currentProfileId && authorId && authorId === currentProfileId);
          const createdAt = resolveCommentCreatedAt(entry);
          const commentId = resolveCommentId(entry);
          return (
            <div key={idx} className="xview-reply">
              <div className="xview-reply-avatar">
                {(authorId ?? "?")[0]?.toUpperCase()}
              </div>
              <div className="xview-reply-body">
                <div className="xview-reply-meta">
                  <span className="xview-reply-author">
                    {authorId ? shortWallet(authorId) : "Unknown"}
                  </span>
                  {createdAt && (
                    <span className="xview-reply-time">· {timeAgo(createdAt)}</span>
                  )}
                  {isOwnerComment && commentId && (
                    confirmDeleteCommentId === commentId ? (
                      <div className="confirm-toggle confirm-toggle--tiny">
                        <button
                          className="confirm-toggle__no"
                          onClick={() => setConfirmDeleteCommentId(null)}
                        >
                          No
                        </button>
                        <button
                          className="confirm-toggle__yes"
                          onClick={() => handleDeleteComment(entry)}
                        >
                          Yes
                        </button>
                      </div>
                    ) : (
                      <button
                        className="xview-reply-delete"
                        onClick={() => setConfirmDeleteCommentId(commentId)}
                      >
                        Delete
                      </button>
                    )
                  )}
                </div>
                <p className="xview-reply-text">{resolveCommentText(entry)}</p>
              </div>
            </div>
          );
        })}

        {comments.length < commentTotal && (
          <button
            className="xview-load-more"
            onClick={() => loadComments(commentPage + 1)}
            disabled={commentLoading}
          >
            {commentLoading ? "Loading…" : "Show more replies"}
          </button>
        )}
      </div>
    </div>
  );
}
