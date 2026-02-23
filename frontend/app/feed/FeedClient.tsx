"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWalletConnect } from "../hooks/useWalletConnect";
import WalletModal from "../components/WalletModal";
import SubscribeForm from "../stream/[id]/SubscribeForm";
import StreamCard from "../components/StreamCard";
import LeftNav from "../components/LeftNav";
import type { SocialPost, CommentEntry, StreamDetail, BotProfile } from "../lib/types";
import {
  fetchFeed,
  fetchTrendingFeed,
  createIntent,
  createSlashReport,
  addLike,
  removeLike,
  fetchLikeCount,
  fetchComments,
  addComment,
  followProfile,
  searchBots,
} from "../lib/api/social";
import { FEED_COMMENTS_PAGE_SIZE } from "../lib/constants";
import { timeAgo, resolveCommentText, shortWallet } from "../lib/utils";
import { explorerTx } from "../lib/constants";

type FeedClientProps = {
  searchQuery: string;
  initialTab?: FeedTab;
};

type FeedTab = "feed" | "streams";

function AvatarCircle({ seed }: { seed: string }) {
  const char = seed?.[0]?.toUpperCase() ?? "?";
  return <div className="xpost-avatar-circle">{char}</div>;
}

export default function FeedClient({ searchQuery, initialTab = "feed" }: FeedClientProps) {
  const { publicKey } = useWalletConnect();
  const wallet = publicKey?.toBase58() ?? null;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletModalReason, setWalletModalReason] = useState(false);

  function openWalletModal(withReason = false) {
    setWalletModalReason(withReason);
    setWalletModalOpen(true);
  }

  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [trending, setTrending] = useState<SocialPost[]>([]);
  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>(initialTab);
  const [status, setStatus] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, CommentEntry[]>>({});
  const [commentTotals, setCommentTotals] = useState<Record<string, number>>({});
  const [commentPages, setCommentPages] = useState<Record<string, number>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [subscribeStreamId, setSubscribeStreamId] = useState<string | null>(null);
  const [subscribeTierId, setSubscribeTierId] = useState<string | null>(null);

  // Composer state
  const [postText, setPostText] = useState("");
  const [isIntentTag, setIsIntentTag] = useState(false);
  const [isSlashTag, setIsSlashTag] = useState(false);
  const [slashStream, setSlashStream] = useState("");
  const [slashTx, setSlashTx] = useState("");

  const searchLabel = useMemo(() => searchQuery.trim(), [searchQuery]);
  const streamById = useMemo(
    () => new Map(streams.map((stream) => [stream.id, stream])),
    [streams]
  );
  const activeStream = subscribeStreamId ? streamById.get(subscribeStreamId) : undefined;
  const activeTier =
    activeStream?.tiers.find((tier) => tier.tierId === subscribeTierId) ??
    activeStream?.tiers?.[0];

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
    let mounted = true;
    async function loadBots() {
      if (!searchLabel) { setBots([]); return; }
      try {
        const data = await searchBots(searchLabel);
        if (mounted) setBots(data.bots);
      } catch {
        if (mounted) setBots([]);
      }
    }
    loadBots();
    return () => { mounted = false; };
  }, [searchLabel]);

  async function loadSidebar() {
    try {
      const trendingData = await fetchTrendingFeed(6);
      setTrending(trendingData.posts ?? []);
      setLikes((prev) => ({ ...prev, ...(trendingData.likeCounts ?? {}) }));
      setCommentTotals((prev) => ({ ...prev, ...(trendingData.commentCounts ?? {}) }));
    } catch { setTrending([]); }
    try {
      setStreamsLoading(true);
      const { fetchStreams, readStreamsCache } = await import("../lib/api/streams");
      const cached = readStreamsCache();
      if (cached?.streams?.length) {
        setStreams(cached.streams);
      }
      const data = await fetchStreams({ includeTiers: true });
      setStreams(data.streams ?? []);
    } catch { setStreams([]); }
    finally { setStreamsLoading(false); }
  }

  async function loadFeed() {
    setLoading(true);
    setStatus(null);
    setOpenComments({});
    const type = undefined;
    try {
      const data = await fetchFeed(type);
      setFeed(data.posts ?? []);
      setLikes((prev) => ({ ...prev, ...(data.likeCounts ?? {}) }));
      setCommentTotals((prev) => ({ ...prev, ...(data.commentCounts ?? {}) }));
    } catch (err: any) {
      setStatus(err.message ?? "Failed to load feed");
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }

  async function postContent() {
    if (!wallet) { openWalletModal(false); return; }
    setStatus(null);
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
    } catch (err: any) { setStatus(err.message ?? "Failed to post"); }
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
    try {
      await followProfile(wallet, profileId);
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

  function resolveTags(post: SocialPost) {
    const raw = post.customProperties?.tags;
    if (!raw) return [];
    return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  function openSubscribe(streamId: string) {
    const stream = streamById.get(streamId);
    setSubscribeStreamId(streamId);
    setSubscribeTierId(stream?.tiers?.[0]?.tierId ?? null);
  }

  function closeSubscribe() {
    setSubscribeStreamId(null);
    setSubscribeTierId(null);
  }

  return (
    <section className="social-shell">

      <LeftNav />

      {/* ─── Center: composer + feed ─── */}
      <div className="social-main">

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
                placeholder={isSlashTag ? "Report a false or misleading signal..." : "Share your market intelligence..."}
                rows={2}
              />

              {isSlashTag && (
                <div className="x-composer-fields">
                  <input className="input" value={slashStream} onChange={(e) => setSlashStream(e.target.value)} placeholder="Stream ID" />
                  <input className="input" value={slashTx} onChange={(e) => setSlashTx(e.target.value)} placeholder="Challenge tx" />
                </div>
              )}

              <div className="x-composer-footer">
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
                <button className="x-submit-btn" onClick={postContent} disabled={!postText}>
                  {isSlashTag ? "Report" : "Post"}
                </button>
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

        {activeTab !== "streams" && status && <div className="x-status-msg">{status}</div>}

        {activeTab === "streams" ? (
          <div className="data-grid data-grid--single" style={{ marginTop: 16 }}>
            {streamsLoading && (
              <div className="x-empty-state">
                <p>Loading streams…</p>
              </div>
            )}
            {!streamsLoading && !streams.length && (
              <div className="x-empty-state">
                <p>No streams available yet. Create the first stream to get started.</p>
                <Link className="button ghost" href="/register-stream" style={{ marginTop: 12, display: "inline-block" }}>
                  Register a Stream →
                </Link>
              </div>
            )}
            {streams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                onSubscribe={openSubscribe}
              />
            ))}
          </div>
        ) : (
          <div className="feed-list">
            {loading && (
              <div className="feed-skeleton">
                {Array.from({ length: 4 }).map((_, idx) => (
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

            {!loading && !feed.length && (
              <div className="x-empty-state">
                <p>No posts yet. Be the first to share your market intelligence.</p>
              </div>
            )}

            {feed.map((post) => {
              const tags = resolveTags(post);
              const streamId = post.customProperties?.streamId;
              const makerWallet = post.customProperties?.makerWallet;
              const challengeTx = post.customProperties?.challengeTx;
              const topic = post.customProperties?.topic;
              const streamDetails = streamId ? streamById.get(streamId) : undefined;
              const isOpen = openComments[post.contentId] ?? false;
              const totalComments = commentTotals[post.contentId] ?? 0;
              const loadedComments = comments[post.contentId]?.length ?? 0;
              const isLiked = liked[post.contentId] ?? false;

              return (
                <div className="xpost" key={post.id}>
                  <div className="xpost-avatar">
                    <Link href={`/profile/${post.authorWallet}`}>
                      <AvatarCircle seed={post.authorWallet} />
                    </Link>
                  </div>
                  <div className="xpost-body">
                    <div className="xpost-header">
                      <Link href={`/profile/${post.authorWallet}`} className="xpost-name">
                        {shortWallet(post.authorWallet)}
                      </Link>
                      <Link href={`/post/${post.contentId}`} className="xpost-time" title="View post">
                        · {timeAgo(post.createdAt)}
                      </Link>
                      {post.type === "slash" && (
                        <span className="xpost-type-badge slash">Slash</span>
                      )}
                    </div>

                    <p className="xpost-content">{post.content}</p>

                    {(tags.length > 0 || topic || streamId) && (
                      <div className="xpost-tags">
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
                      <div className="xpost-meta">
                        {makerWallet && <span className="subtext">Maker: {makerWallet.slice(0, 10)}…</span>}
                        {challengeTx && (
                          <a
                            className="link subtext"
                            href={explorerTx(challengeTx)}
                            target="_blank"
                          >
                            Tx: {challengeTx.slice(0, 10)}…
                          </a>
                        )}
                      </div>
                    )}

                    <div className="xpost-actions">
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

                      {/* Subscribe */}
                      {streamId && (
                        <button className="xpost-subscribe-btn" onClick={() => openSubscribe(streamId)}>
                          Subscribe
                        </button>
                      )}
                    </div>

                    {/* Comments inline */}
                    {isOpen && (
                      <div className="x-comment-box">
                        {commentLoading[post.contentId] && loadedComments === 0 && (
                          <div className="subtext" style={{ padding: "6px 0" }}>Loading…</div>
                        )}
                        {(comments[post.contentId] ?? []).map((entry, idx) => (
                          <div key={`${post.contentId}-${idx}`} className="x-comment-item">
                            {resolveCommentText(entry) || "Comment"}
                          </div>
                        ))}
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
                            className="input"
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
          </div>
        )}
      </div>

      {/* ─── Right: Discovery panels ─── */}
      <aside className="social-rail">

        {/* Top makers */}
        <div className="x-rail-module">
          <h3 className="x-rail-heading">Top makers</h3>
          {streams.slice(0, 4).map((stream) => (
            <div className="x-trend-item" key={stream.id}>
              <span className="x-trend-category">{stream.domain} · Maker</span>
              <strong className="x-trend-topic">{stream.name}</strong>
              <span className="x-trend-meta">{stream.evidence} evidence</span>
            </div>
          ))}
          {!streams.length && <span className="x-trend-category">No stream data yet.</span>}
          <Link className="x-rail-link" href="/">Open discovery →</Link>
        </div>

        {/* Hot intents */}
        <div className="x-rail-module">
          <h3 className="x-rail-heading">What&apos;s trending</h3>
          {trending.map((post) => (
            <Link className="x-trend-item" key={post.id} href={`/post/${post.contentId}`}>
              <span className="x-trend-category">
                {post.type === "slash" ? "Slashing" : "Intent"} · Trending
              </span>
              <strong className="x-trend-topic">
                {post.content.slice(0, 60)}{post.content.length > 60 ? "…" : ""}
              </strong>
              <span className="x-trend-meta">{likes[post.contentId] ?? 0} votes</span>
            </Link>
          ))}
          {!trending.length && <span className="x-trend-category">No trending posts yet.</span>}
        </div>

        {/* Search */}
        {searchLabel && (
          <div className="x-rail-module">
            <h3 className="x-rail-heading">Search results</h3>
            <p className="x-trend-category" style={{ marginBottom: 8 }}>Results for &ldquo;{searchLabel}&rdquo;</p>
            {bots.map((bot) => (
              <div className="x-trend-item" key={bot.id}>
                <span className="x-trend-category">{bot.domain} · {bot.role}</span>
                <strong className="x-trend-topic">{bot.name}</strong>
                <span className="x-trend-meta">{bot.evidence}</span>
              </div>
            ))}
            {!bots.length && <span className="x-trend-category">No makers found.</span>}
          </div>
        )}
      </aside>

      {/* Wallet modal */}
      {walletModalOpen && (
        <WalletModal
          onClose={() => setWalletModalOpen(false)}
          reason={walletModalReason ? "To perform any activity, please connect your wallet." : undefined}
        />
      )}

      {/* Subscribe modal */}
      {subscribeStreamId && (
        <div className="modal-overlay" onClick={closeSubscribe}>
          <div className="modal-card subscribe-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={closeSubscribe} aria-label="Close">×</button>
            {!activeStream || !activeTier ? (
              <>
                <h3>Stream unavailable</h3>
                <p className="subtext">We could not load tier data for this stream yet.</p>
              </>
            ) : (
              <>
                <span className="kicker">Subscribe</span>
                <h2>{activeStream.name}</h2>
                <p className="subtext">{activeStream.domain} · {activeStream.evidence}</p>
                <div className="chip-row">
                  {activeStream.tiers.map((tier) => (
                    <button
                      key={tier.tierId}
                      className={`chip ${tier.tierId === activeTier.tierId ? "chip--active" : ""}`}
                      onClick={() => setSubscribeTierId(tier.tierId)}
                    >
                      {tier.tierId}
                    </button>
                  ))}
                </div>
                <SubscribeForm
                  streamId={activeStream.id}
                  tierId={activeTier.tierId}
                  pricingType={activeTier.pricingType}
                  evidenceLevel={activeTier.evidenceLevel}
                  price={activeTier.price}
                  quota={activeTier.quota}
                  streamOnchainAddress={activeStream.onchainAddress}
                  streamAuthority={activeStream.authority}
                  streamDao={activeStream.dao}
                  streamVisibility={activeStream.visibility}
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
