"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWalletConnect } from "../hooks/useWalletConnect";
import WalletModal from "../components/WalletModal";
import StreamCard from "../components/StreamCard";
import type { SocialPost, CommentEntry, StreamDetail, AgentProfile } from "../lib/types";
import {
  fetchFeed,
  readFeedCache,
  createIntent,
  createSlashReport,
  addLike,
  removeLike,
  fetchLikeCount,
  fetchComments,
  addComment,
  deleteComment,
  deletePost,
  followProfile,
  fetchFollowingIds,
  readFollowingCache,
  searchAgents,
} from "../lib/api/social";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../lib/api/subscriptions";
import { FEED_COMMENTS_PAGE_SIZE } from "../lib/constants";
import {
  timeAgo,
  resolveCommentText,
  resolveCommentId,
  resolveCommentAuthorId,
  shortWallet,
} from "../lib/utils";
import { useCurrentUserProfileId } from "../hooks/useCurrentUserProfileId";

type FeedClientProps = {
  searchQuery: string;
  initialTab?: FeedTab;
  initialFilter?: PostFilter;
};

type FeedTab = "feed" | "streams";
type PostFilter = "explore" | "intent" | "slashing" | "mine";

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function gradientForSeed(seed: string) {
  if (!seed) return "var(--accent-2)";
  const hash = hashSeed(seed);
  const hueA = hash % 360;
  const hueB = (hash * 7) % 360;
  const satA = 62 + (hash % 18);
  const satB = 58 + ((hash >> 3) % 18);
  const lightA = 46 + ((hash >> 5) % 12);
  const lightB = 38 + ((hash >> 9) % 12);
  return `linear-gradient(135deg, hsl(${hueA}, ${satA}%, ${lightA}%), hsl(${hueB}, ${satB}%, ${lightB}%))`;
}

function AvatarCircle({ seed }: { seed: string }) {
  const char = seed?.[0]?.toUpperCase() ?? "?";
  const gradient = gradientForSeed(seed ?? "");
  return (
    <div className="xpost-avatar-circle" style={{ background: gradient }}>
      {char}
    </div>
  );
}

export default function FeedClient({ searchQuery, initialTab = "feed", initialFilter = "explore" }: FeedClientProps) {
  const router = useRouter();
  const { publicKey } = useWalletConnect();
  const wallet = publicKey?.toBase58() ?? null;
  const currentProfileId = useCurrentUserProfileId();

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletModalReason, setWalletModalReason] = useState(false);

  function openWalletModal(withReason = false) {
    setWalletModalReason(withReason);
    setWalletModalOpen(true);
  }

  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>(initialTab);
  const [postFilter, setPostFilter] = useState<PostFilter>(initialFilter);
  const [status, setStatus] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, CommentEntry[]>>({});
  const [commentTotals, setCommentTotals] = useState<Record<string, number>>({});
  const [commentPages, setCommentPages] = useState<Record<string, number>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const [subscribedStreamAddresses, setSubscribedStreamAddresses] = useState<Set<string>>(new Set());
  const [streamSearch, setStreamSearch] = useState("");

  // Composer state
  const [postText, setPostText] = useState("");
  const [isIntentTag, setIsIntentTag] = useState(false);
  const [isSlashTag, setIsSlashTag] = useState(false);
  const [slashStream, setSlashStream] = useState("");
  const [slashTx, setSlashTx] = useState("");
  const [posting, setPosting] = useState(false);

  const searchLabel = useMemo(() => searchQuery.trim(), [searchQuery]);
  const streamById = useMemo(
    () => new Map(streams.map((stream) => [stream.id, stream])),
    [streams]
  );
  const streamSearchNorm = streamSearch.trim().toLowerCase();
  const streamMatchSet = useMemo(() => {
    if (!streamSearchNorm) return new Set<string>();
    return new Set(
      streams
        .filter(
          (s) =>
            s.name.toLowerCase().includes(streamSearchNorm) ||
            s.id.toLowerCase().includes(streamSearchNorm)
        )
        .map((s) => s.id)
    );
  }, [streams, streamSearchNorm]);
  const sortedStreams = useMemo(() => {
    if (!streamSearchNorm) return streams;
    return [...streams].sort((a, b) => {
      const aMatch = streamMatchSet.has(a.id) ? 0 : 1;
      const bMatch = streamMatchSet.has(b.id) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [streams, streamSearchNorm, streamMatchSet]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setPostFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (activeTab === "streams") {
      setLoading(false);
      setStatus(null);
      setFeed([]);
      setOpenComments({});
      return;
    }
    void loadFeed();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadSidebar();
  }, []);

  useEffect(() => {
    let active = true;
    if (!wallet) {
      setFollowingIds(new Set());
      return;
    }
    setFollowingIds(new Set());
    const cached = readFollowingCache(wallet);
    if (cached?.length) {
      setFollowingIds(new Set(cached));
    }
    (async () => {
      try {
        const data = await fetchFollowingIds(wallet);
        if (!active) return;
        setFollowingIds(new Set(data.following ?? []));
      } catch {
        // ignore follow list fetch failures
      }
    })();
    return () => {
      active = false;
    };
  }, [wallet]);

  useEffect(() => {
    let active = true;
    if (!wallet) {
      setSubscribedStreamAddresses(new Set());
      return;
    }
    const cached = readSubscriptionsCache(wallet);
    if (cached?.subscriptions?.length) {
      setSubscribedStreamAddresses(
        new Set(cached.subscriptions.filter((s) => s.status === 0).map((s) => s.stream))
      );
    }
    (async () => {
      try {
        const data = await fetchOnchainSubscriptions(wallet);
        if (!active) return;
        setSubscribedStreamAddresses(
          new Set((data.subscriptions ?? []).filter((s) => s.status === 0).map((s) => s.stream))
        );
      } catch {
        // ignore subscription fetch failures
      }
    })();
    return () => {
      active = false;
    };
  }, [wallet]);

  useEffect(() => {
    let mounted = true;
    async function loadAgents() {
      if (!searchLabel) {
        setAgents([]);
        return;
      }
      try {
        const data = await searchAgents(searchLabel);
        if (mounted) setAgents(data.agents);
      } catch {
        if (mounted) setAgents([]);
      }
    }
    loadAgents();
    return () => { mounted = false; };
  }, [searchLabel]);

  async function loadSidebar() {
    try {
      const { fetchStreams, readStreamsCache } = await import("../lib/api/streams");
      const cached = readStreamsCache();
      if (cached?.streams?.length) {
        setStreams(cached.streams);
      }
      if (cached === null) setStreamsLoading(true);
      const data = await fetchStreams({ includeTiers: true });
      setStreams(data.streams ?? []);
    } catch {
      // preserve existing UI on transient errors
    }
    finally { setStreamsLoading(false); }
  }

  async function loadFeed() {
    setStatus(null);
    setOpenComments({});
    const cached = readFeedCache();
    if (cached?.posts?.length) {
      setFeed(cached.posts);
      setLikes((prev) => ({ ...prev, ...(cached.likeCounts ?? {}) }));
      setCommentTotals((prev) => ({ ...prev, ...(cached.commentCounts ?? {}) }));
    }
    if (cached === null) setLoading(true);
    const type = undefined;
    try {
      const data = await fetchFeed(type);
      setFeed(data.posts ?? []);
      setLikes((prev) => ({ ...prev, ...(data.likeCounts ?? {}) }));
      setCommentTotals((prev) => ({ ...prev, ...(data.commentCounts ?? {}) }));
    } catch (err: any) {
      setStatus(err.message ?? "Failed to load feed");
      // preserve existing feed on transient errors
    } finally {
      setLoading(false);
    }
  }

  const slashReady = !isSlashTag || (slashStream.trim().length > 0 && slashTx.trim().length > 0);

  function resolveTags(post: SocialPost) {
    const raw = post.customProperties?.tags;
    if (!raw) return [];
    return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  const filteredFeed = useMemo(() => {
    if (postFilter === "explore") return feed;
    if (postFilter === "slashing") {
      return feed.filter((post) => post.type === "slash");
    }
    if (postFilter === "intent") {
      return feed.filter((post) => resolveTags(post).includes("intent"));
    }
    return feed.filter((post) =>
      Boolean(
        (wallet && post.authorWallet === wallet) ||
        (currentProfileId && post.profileId === currentProfileId)
      )
    );
  }, [feed, postFilter, wallet, currentProfileId]);

  async function postContent() {
    if (posting) return;
    if (!wallet) { openWalletModal(false); return; }
    if (isSlashTag && !slashReady) {
      setStatus("Slashing requires a Stream ID and Challenge tx.");
      return;
    }
    setStatus(null);
    setPosting(true);
    try {
      if (isSlashTag) {
        await createSlashReport({
          wallet,
          content: postText,
          streamId: slashStream || undefined,
          challengeTx: slashTx || undefined,
        });
        setSlashStream(""); setSlashTx("");
      } else {
        await createIntent({
          wallet,
          content: postText,
          tags: isIntentTag ? ["intent"] : undefined,
        });
      }
      setPostText("");
      setIsIntentTag(false);
      setIsSlashTag(false);
      await loadFeed();
    } catch (err: any) {
      setStatus(err.message ?? "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(contentId: string) {
    if (!wallet) { openWalletModal(true); return; }
    setStatus(null);
    const alreadyLiked = liked[contentId] ?? false;
    setLiked((prev) => ({ ...prev, [contentId]: !alreadyLiked }));
    setLikes((prev) => ({ ...prev, [contentId]: Math.max(0, (prev[contentId] ?? 0) + (alreadyLiked ? -1 : 1)) }));
    try {
      if (alreadyLiked) {
        await removeLike(wallet, contentId);
      } else {
        await addLike(wallet, contentId);
      }
      const count = await fetchLikeCount(contentId);
      setLikes((prev) => ({ ...prev, [contentId]: count }));
    } catch (err: any) {
      setLiked((prev) => ({ ...prev, [contentId]: alreadyLiked }));
      setLikes((prev) => ({ ...prev, [contentId]: Math.max(0, (prev[contentId] ?? 0) + (alreadyLiked ? 1 : -1)) }));
      setStatus(err.message ?? "Vote failed");
    }
  }

  async function followAuthor(profileId: string) {
    if (!wallet) { openWalletModal(true); return; }
    if (!profileId) return;
    try {
      await followProfile(wallet, profileId);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.add(profileId);
        return next;
      });
      setStatus("Following profile.");
    } catch (err: any) { setStatus(err.message ?? "Follow failed"); }
  }

  async function loadComments(contentId: string, page = 1) {
    try {
      setCommentLoading((prev) => ({ ...prev, [contentId]: true }));
      const data = await fetchComments(contentId, page, FEED_COMMENTS_PAGE_SIZE);
      setComments((prev) => ({ ...prev, [contentId]: data.comments ?? [] }));
      setCommentTotals((prev) => ({ ...prev, [contentId]: data.total ?? data.comments?.length ?? 0 }));
      setCommentPages((prev) => ({ ...prev, [contentId]: data.page ?? page }));
    } catch {
    } finally {
      setCommentLoading((prev) => ({ ...prev, [contentId]: false }));
    }
  }

  async function loadMoreComments(contentId: string) {
    try {
      setCommentLoading((prev) => ({ ...prev, [contentId]: true }));
      const nextPage = (commentPages[contentId] ?? 1) + 1;
      const data = await fetchComments(contentId, nextPage, FEED_COMMENTS_PAGE_SIZE);
      setComments((prev) => ({ ...prev, [contentId]: [...(prev[contentId] ?? []), ...(data.comments ?? [])] }));
      setCommentTotals((prev) => ({ ...prev, [contentId]: data.total ?? prev[contentId] ?? 0 }));
      setCommentPages((prev) => ({ ...prev, [contentId]: data.page ?? nextPage }));
    } catch {
    } finally {
      setCommentLoading((prev) => ({ ...prev, [contentId]: false }));
    }
  }

  async function postComment(contentId: string) {
    if (!wallet) { openWalletModal(true); return; }
    const value = commentDraft[contentId];
    if (!value) return;
    const optimistic: CommentEntry = { comment: value, createdAt: Date.now() };
    setComments((prev) => ({ ...prev, [contentId]: [...(prev[contentId] ?? []), optimistic] }));
    setCommentTotals((prev) => ({ ...prev, [contentId]: (prev[contentId] ?? 0) + 1 }));
    try {
      await addComment(wallet, contentId, value);
      setCommentDraft((prev) => ({ ...prev, [contentId]: "" }));
      setCommentPages((prev) => ({ ...prev, [contentId]: 1 }));
      await loadComments(contentId, 1);
    } catch (err: any) {
      setComments((prev) => ({ ...prev, [contentId]: (prev[contentId] ?? []).filter((e) => e !== optimistic) }));
      setCommentTotals((prev) => ({ ...prev, [contentId]: Math.max(0, (prev[contentId] ?? 1) - 1) }));
      setStatus(err.message ?? "Comment failed");
    }
  }

  async function removePost(contentId: string) {
    if (!wallet) { openWalletModal(true); return; }
    setDeletingPostId(contentId);
    try {
      await deletePost(wallet, contentId);
      setFeed((prev) => prev.filter((post) => post.contentId !== contentId));
    } catch (err: any) {
      setStatus(err?.message ?? "Delete failed");
    } finally {
      setDeletingPostId(null);
      setConfirmDeletePostId(null);
    }
  }

  async function removeComment(contentId: string, entry: CommentEntry) {
    if (!wallet) { openWalletModal(true); return; }
    const commentId = resolveCommentId(entry);
    if (!commentId) {
      setStatus("Unable to resolve comment id.");
      return;
    }
    setDeletingCommentId(commentId);
    try {
      await deleteComment(wallet, commentId);
      setComments((prev) => {
        const next = (prev[contentId] ?? []).filter((item) => resolveCommentId(item) !== commentId);
        return { ...prev, [contentId]: next };
      });
      setCommentTotals((prev) => ({
        ...prev,
        [contentId]: Math.max(0, (prev[contentId] ?? 0) - 1),
      }));
    } catch (err: any) {
      setStatus(err?.message ?? "Delete failed");
    } finally {
      setDeletingCommentId(null);
      setConfirmDeleteCommentId(null);
    }
  }

  return (
    <>

        {/* Composer */}
        {activeTab !== "streams" && (
          <div className="x-composer" style={{ position: "relative" }}>
            <div className="x-composer-avatar">
              <AvatarCircle seed={wallet ?? "?"} />
            </div>
            <div className="x-composer-body">

              <textarea
                className="x-composer-textarea"
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={isSlashTag ? "Report a false or misleading signal..." : isIntentTag ? "Describe your intent..." : "Cooking Perishable-aplha, will make a stream soon..."}
                rows={2}
              />

              <div className="x-composer-footer">
                <div className="x-composer-tags">
                  <button
                    className={`composer-tag-btn${isIntentTag ? " composer-tag-btn--active" : ""}`}
                    onClick={() => { setIsIntentTag((v) => !v); setIsSlashTag(false); }}
                  >
                    # Intent
                  </button>
                  <button
                    className={`composer-tag-btn${isSlashTag ? " composer-tag-btn--active" : ""}`}
                    onClick={() => { setIsSlashTag((v) => !v); setIsIntentTag(false); }}
                  >
                    # Slashing
                  </button>
                </div>
                <button
                  className="x-submit-btn"
                  onClick={postContent}
                  disabled={!postText || posting || !slashReady}
                >
                  {posting ? "Posting..." : isSlashTag ? "Report" : "Post"}
                </button>
              </div>

              <div className={`x-composer-fields${isSlashTag ? " x-composer-fields--open" : ""}`}>
                <div className="md-field">
                  <label className="md-label">Stream ID</label>
                  <input className="md-input" value={slashStream} onChange={(e) => setSlashStream(e.target.value)} placeholder="Stream ID" />
                </div>
                <div className="md-field">
                  <label className="md-label">Challenge tx</label>
                  <input className="md-input" value={slashTx} onChange={(e) => setSlashTx(e.target.value)} placeholder="Challenge tx" />
                </div>
              </div>

            </div>
            {!wallet && (
              <div className="composer-gate">
                <button className="button primary" onClick={() => openWalletModal(false)}>
                  Connect wallet to post
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab !== "streams" && (
          <>
          <div className="maker-tabs feed-tabs">
            <button
              className={`maker-tab${postFilter === "explore" ? " maker-tab--active" : ""}`}
              onClick={() => setPostFilter("explore")}
            >
              Explore
            </button>
            <button
              className={`maker-tab${postFilter === "intent" ? " maker-tab--active" : ""}`}
              onClick={() => setPostFilter("intent")}
            >
              Intent
            </button>
            <button
              className={`maker-tab${postFilter === "slashing" ? " maker-tab--active" : ""}`}
              onClick={() => setPostFilter("slashing")}
            >
              Slashing
            </button>
            <button
              className={`maker-tab${postFilter === "mine" ? " maker-tab--active" : ""}`}
              onClick={() => {
                if (!wallet && !currentProfileId) {
                  openWalletModal(true);
                  return;
                }
                setPostFilter("mine");
              }}
            >
              My Posts
            </button>
          </div>
          <p className="feed-tab-description">
            {postFilter === "explore" && "The firehose — everything publishers and listeners are dropping right now. Dive in and see what's cooking."}
            {postFilter === "intent" && "Got alpha you wish existed? Drop it here. Signal creators watch this space to find out what the market actually wants."}
            {postFilter === "slashing" && "Think a signal missed the mark? Call it out. The community votes, and bad calls get slashed."}
            {postFilter === "mine" && "Your published posts, collected in one place."}
          </p>
          </>
        )}

        {activeTab !== "streams" && status && <div className="x-status-msg">{status}</div>}

        {activeTab === "streams" ? (
          <>
          <div className="streams-search-bar">
            <p className="streams-search-description">
              Live data feeds, all on-chain. Find a stream you like, hit subscribe, and start catching signals — encrypted or wide open.
            </p>
            <input
              type="text"
              placeholder="Search streams…"
              value={streamSearch}
              onChange={(e) => setStreamSearch(e.target.value)}
            />
          </div>
          <div className="stream-card-grid" style={{ marginTop: 16, marginInline: 16 }}>
            {sortedStreams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                viewerWallet={wallet}
                highlight={streamSearchNorm !== "" && streamMatchSet.has(stream.id)}
                isSubscribed={Boolean(stream.onchainAddress && subscribedStreamAddresses.has(stream.onchainAddress))}
              />
            ))}
            {streamsLoading && !streams.length && (
              <div className="stream-card">
                <p className="subtext" style={{ margin: 0 }}>Loading streams…</p>
              </div>
            )}
            {!streamsLoading && !streams.length && (
              <div className="stream-card">
                <div className="stream-card-bottom">
                  <p className="subtext" style={{ margin: 0 }}>No streams available yet. Create the first stream to get started.</p>
                  <Link className="button ghost" href="/register-stream">
                    Register a Stream →
                  </Link>
                </div>
              </div>
            )}
          </div>
          </>
        ) : (
          <div className="feed-list">
            {filteredFeed.map((post) => {
              const tags = resolveTags(post);
              const streamId = post.customProperties?.streamId;
              const makerWallet = post.customProperties?.makerWallet;
              const challengeTx = post.customProperties?.challengeTx;
              const topic = post.customProperties?.topic;
              const streamDetails = streamId ? streamById.get(streamId) : undefined;
              const isOwnerStream = Boolean(
                wallet &&
                  streamDetails?.authority &&
                  streamDetails.authority === wallet
              );
              const isOpen = openComments[post.contentId] ?? false;
              const totalComments = commentTotals[post.contentId] ?? 0;
              const loadedComments = comments[post.contentId]?.length ?? 0;
              const isLiked = liked[post.contentId] ?? false;
              const isOwnerPost =
                (wallet && post.authorWallet && post.authorWallet === wallet) ||
                (currentProfileId && post.profileId === currentProfileId);
              const canFollow =
                Boolean(wallet && post.profileId && post.authorWallet && post.authorWallet !== wallet);
              const isFollowing = Boolean(post.profileId && followingIds.has(post.profileId));

              return (
                <div className="xpost" key={post.id} onClick={() => router.push(`/feed/${post.contentId}`)}>
                  <div className="xpost-avatar" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/profile/${post.authorWallet}`}>
                      <AvatarCircle seed={post.authorWallet} />
                    </Link>
                  </div>
                  <div className="xpost-body">
                    <div className="xpost-header">
                      <Link href={`/profile/${post.authorWallet}`} className="xpost-name" onClick={(e) => e.stopPropagation()}>
                        {shortWallet(post.authorWallet)}
                      </Link>
                      <Link href={`/feed/${post.contentId}`} className="xpost-time" title="View post" onClick={(e) => e.stopPropagation()}>
                        · {timeAgo(post.createdAt)}
                      </Link>
                      {post.type === "slash" && (
                        <span className="xpost-type-badge slash">Slash</span>
                      )}
                    </div>

                    <p className="xpost-content">{post.content}</p>

                    {(tags.length > 0 || topic || streamId) && (
                      <div className="xpost-tags" onClick={(e) => e.stopPropagation()}>
                        {streamId && (
                          <Link className="xpost-tag" href={`/stream/${streamId}`}>
                            #{streamDetails?.name ?? streamId}
                          </Link>
                        )}
                        {topic && <span className="xpost-tag">#{topic}</span>}
                        {tags.slice(0, 3).map((tag) => (
                          <span className="xpost-tag" key={`${post.id}-${tag}`}>#{tag}</span>
                        ))}
                      </div>
                    )}

                    {(makerWallet || challengeTx) && (
                      <div className="xpost-meta" onClick={(e) => e.stopPropagation()}>
                        {makerWallet && <span className="subtext">Maker: {makerWallet.slice(0, 10)}…</span>}
                        {challengeTx && <span className="subtext">Tx: {challengeTx.slice(0, 10)}…</span>}
                      </div>
                    )}

                    <div className="xpost-actions" onClick={(e) => e.stopPropagation()}>
                      {/* Vote */}
                      <button
                        className={`xpost-action-btn${isLiked ? " liked" : ""}`}
                        onClick={() => toggleLike(post.contentId)}
                        title="Vote"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                        <span>{likes[post.contentId] ?? 0}</span>
                      </button>

                      {/* Comment */}
                      <button
                        className="xpost-action-btn"
                        title="Comments"
                        onClick={() => {
                          if (isOpen) {
                            setOpenComments((prev) => ({ ...prev, [post.contentId]: false }));
                            return;
                          }
                          setOpenComments((prev) => ({ ...prev, [post.contentId]: true }));
                          setCommentPages((prev) => ({ ...prev, [post.contentId]: 1 }));
                          void loadComments(post.contentId, 1);
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>{totalComments}</span>
                      </button>

                      {/* Follow */}
                      {canFollow && !isFollowing && (
                        <button
                          className="xpost-action-btn"
                          title="Follow maker"
                          onClick={() => followAuthor(post.profileId)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                          </svg>
                          <span>Follow</span>
                        </button>
                      )}
                      {canFollow && isFollowing && (
                        <button
                          className="xpost-action-btn following"
                          title="Already following"
                          disabled
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" />
                          </svg>
                          <span>Following</span>
                        </button>
                      )}

                      {isOwnerPost && (
                        confirmDeletePostId === post.contentId ? (
                          <div className="confirm-toggle confirm-toggle--compact">
                            <button
                              className="confirm-toggle__no"
                              onClick={() => setConfirmDeletePostId(null)}
                              disabled={deletingPostId === post.contentId}
                            >
                              No
                            </button>
                            <button
                              className="confirm-toggle__yes"
                              onClick={() => removePost(post.contentId)}
                              disabled={deletingPostId === post.contentId}
                            >
                              {deletingPostId === post.contentId ? (
                                <><span className="spinner-inline" /> Deleting</>
                              ) : "Yes"}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="xpost-action-btn delete"
                            title="Delete post"
                            onClick={() => setConfirmDeletePostId(post.contentId)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                            <span>Delete</span>
                          </button>
                        )
                      )}

                      {/* Subscribe */}
                      {streamId && !isOwnerStream && (
                        <button
                          className="xpost-subscribe-btn"
                          onClick={() => router.push(`/stream/${streamId}`)}
                        >
                          Subscribe
                        </button>
                      )}
                    </div>

                    {/* Comments inline */}
                    {isOpen && (
                      <div className="x-comment-box" onClick={(e) => e.stopPropagation()}>
                        {commentLoading[post.contentId] && loadedComments === 0 && (
                          <div className="subtext" style={{ padding: "6px 0" }}>Loading…</div>
                        )}
                        {(comments[post.contentId] ?? []).map((entry, idx) => {
                          const authorId = resolveCommentAuthorId(entry);
                          const canDelete = Boolean(currentProfileId && authorId && authorId === currentProfileId);
                          const commentId = resolveCommentId(entry);
                          return (
                            <div key={`${post.contentId}-${idx}`} className="x-comment-item">
                              <span className="x-comment-text">{resolveCommentText(entry) || "Comment"}</span>
                              {canDelete && commentId && (
                                confirmDeleteCommentId === commentId ? (
                                  <div className="confirm-toggle confirm-toggle--tiny">
                                    <button
                                      className="confirm-toggle__no"
                                      onClick={() => setConfirmDeleteCommentId(null)}
                                      disabled={deletingCommentId === commentId}
                                    >
                                      No
                                    </button>
                                    <button
                                      className="confirm-toggle__yes"
                                      onClick={() => removeComment(post.contentId, entry)}
                                      disabled={deletingCommentId === commentId}
                                    >
                                      {deletingCommentId === commentId ? (
                                        <><span className="spinner-inline" /> Deleting</>
                                      ) : "Yes"}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="x-comment-delete"
                                    onClick={() => setConfirmDeleteCommentId(commentId)}
                                  >
                                    Delete
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })}
                        {loadedComments === 0 && !commentLoading[post.contentId] && (
                          <p className="subtext">No comments yet.</p>
                        )}
                        {loadedComments < totalComments && (
                          <button className="xpost-action-btn" onClick={() => loadMoreComments(post.contentId)}>
                            Load more
                          </button>
                        )}
                        <div className="x-comment-input">
                          <input
                            className="md-input"
                            placeholder="Post a reply…"
                            value={commentDraft[post.contentId] ?? ""}
                            onChange={(e) => setCommentDraft((prev) => ({ ...prev, [post.contentId]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void postComment(post.contentId);
                              }
                            }}
                          />
                          <button className="x-submit-btn" onClick={() => postComment(post.contentId)}>
                            Reply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && !feed.length && (
              <div className="feed-skeleton">
                {Array.from({ length: feed.length ? 2 : 4 }).map((_, idx) => (
                  <div className="xpost shimmer" key={`shimmer-${idx}`}>
                    <div className="xpost-avatar">
                      <div className="x-skel-circle" />
                    </div>
                    <div className="xpost-body">
                      <div className="skeleton-line wide" />
                      <div className="skeleton-line" />
                      <div className="skeleton-line short" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && !filteredFeed.length && (
              <div className="x-empty-state">
                <p>
                  {postFilter === "explore"
                    ? "No posts yet. Be the first to share your market intelligence."
                    : postFilter === "intent"
                      ? "No intent posts yet."
                      : postFilter === "slashing"
                        ? "No slashing reports yet."
                        : wallet || currentProfileId
                          ? "No posts from you yet."
                          : "Connect your wallet to view your posts."}
                </p>
              </div>
            )}
          </div>
        )}

      {/* Search results (center panel) */}
      {searchLabel && (
        <div className="x-rail-module" style={{ marginTop: 16 }}>
          <h3 className="x-rail-heading">Search results</h3>
          <p className="x-trend-category" style={{ marginBottom: 8 }}>Results for &ldquo;{searchLabel}&rdquo;</p>
          {agents.map((agent) => (
            <div className="x-trend-item" key={agent.id}>
              <span className="x-trend-category">
                {agent.domain} · {agent.role === "maker" ? "sender" : "listener"}
              </span>
              <strong className="x-trend-topic">{agent.name}</strong>
              <span className="x-trend-meta">{agent.evidence}</span>
            </div>
          ))}
          {!agents.length && <span className="x-trend-category">No agents found.</span>}
        </div>
      )}

      {/* Wallet modal */}
      {walletModalOpen && (
        <WalletModal
          onClose={() => setWalletModalOpen(false)}
          reason={walletModalReason ? "To perform any activity, please connect your wallet." : undefined}
        />
      )}

    </>
  );
}
