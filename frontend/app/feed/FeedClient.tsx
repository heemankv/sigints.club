"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { deleteJson, fetchJson, postJson } from "../lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import SubscribeForm from "../stream/[id]/SubscribeForm";

type SocialPost = {
  id: string;
  type: "intent" | "slash";
  contentId: string;
  profileId: string;
  authorWallet: string;
  content: string;
  createdAt: number;
  customProperties?: Record<string, string>;
};

type BotProfile = {
  id: string;
  name: string;
  domain: string;
  description?: string;
  role: string;
  evidence: string;
};

type StreamDetail = {
  id: string;
  name: string;
  domain: string;
  evidence: string;
  accuracy: string;
  latency: string;
  onchainAddress?: string;
  authority?: string;
  dao?: string;
  tiers: Array<{
    tierId: string;
    pricingType: string;
    price: string;
    quota?: string;
    evidenceLevel: string;
  }>;
};

type CommentEntry = {
  id?: string;
  comment?: string;
  content?: string | { text?: string };
  text?: string;
  profileId?: string;
  createdAt?: number;
};

type FeedClientProps = {
  searchQuery: string;
};

type FeedTab = "foryou" | "following" | "intents" | "slashing";

const FEED_TABS: Array<{ id: FeedTab; label: string }> = [
  { id: "foryou", label: "For you" },
  { id: "following", label: "Following" },
  { id: "intents", label: "Intents" },
  { id: "slashing", label: "Slashing" },
];

const NAV_ITEMS = [
  {
    href: "/feed", label: "Feed",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  },
  {
    href: "/", label: "Discover",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  },
  {
    href: "/signals", label: "Signals",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  },
  {
    href: "/profile", label: "Profile",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  },
];

const COMMENTS_PAGE_SIZE = 3;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(ts).toLocaleDateString();
}

function AvatarCircle({ seed }: { seed: string }) {
  const char = seed?.[0]?.toUpperCase() ?? "?";
  return <div className="xpost-avatar-circle">{char}</div>;
}

export default function FeedClient({ searchQuery }: FeedClientProps) {
  const pathname = usePathname();
  const { wallets, wallet: walletAdapter, select, connect, connecting, publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? process.env.NEXT_PUBLIC_TEST_WALLET;
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletModalReason, setWalletModalReason] = useState(false);
  const pendingConnect = useRef(false);

  function openWalletModal(withReason = false) {
    setWalletModalReason(withReason);
    setWalletModalOpen(true);
  }

  const detectedWallets = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable
  );

  useEffect(() => {
    if (!pendingConnect.current || !walletAdapter || publicKey || connecting) return;
    pendingConnect.current = false;
    connect().catch(() => {});
  }, [walletAdapter, publicKey, connecting]);

  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [trending, setTrending] = useState<SocialPost[]>([]);
  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>("foryou");
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

  const [composerMode, setComposerMode] = useState<"intent" | "slash">("intent");
  const [intentText, setIntentText] = useState("");
  const [intentTopic, setIntentTopic] = useState("");
  const [intentTags, setIntentTags] = useState("");
  const [slashText, setSlashText] = useState("");
  const [slashStream, setSlashStream] = useState("");
  const [slashMakerWallet, setSlashMakerWallet] = useState("");
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
    void loadFeed();
  }, [activeTab]);

  useEffect(() => {
    void loadSidebar();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadBots() {
      if (!searchLabel) { setBots([]); return; }
      try {
        const data = await fetchJson<{ bots: BotProfile[] }>(`/bots?search=${encodeURIComponent(searchLabel)}`);
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
      const trendingData = await fetchJson<{ posts: SocialPost[]; likeCounts: Record<string, number>; commentCounts?: Record<string, number> }>(
        "/social/feed/trending?limit=6"
      );
      setTrending(trendingData.posts ?? []);
      setLikes((prev) => ({ ...prev, ...(trendingData.likeCounts ?? {}) }));
      setCommentTotals((prev) => ({ ...prev, ...(trendingData.commentCounts ?? {}) }));
    } catch { setTrending([]); }
    try {
      const data = await fetchJson<{ streams: StreamDetail[] }>("/streams?includeTiers=true");
      setStreams(data.streams ?? []);
    } catch { setStreams([]); }
  }

  async function loadFeed() {
    setLoading(true);
    setStatus(null);
    setOpenComments({});
    const scope = activeTab === "following" ? "following" : "all";
    const type = activeTab === "intents" ? "intent" : activeTab === "slashing" ? "slash" : "all";
    try {
      if (scope === "following") {
        if (!wallet) {
          setFeed([]);
          setStatus("Connect your wallet to view your following feed.");
          return;
        }
        const query = type === "all" ? "" : `&type=${type}`;
        const data = await fetchJson<{ posts: SocialPost[]; likeCounts?: Record<string, number>; commentCounts?: Record<string, number> }>(
          `/social/feed?scope=following&wallet=${encodeURIComponent(wallet)}${query}`
        );
        setFeed(data.posts ?? []);
        setLikes((prev) => ({ ...prev, ...(data.likeCounts ?? {}) }));
        setCommentTotals((prev) => ({ ...prev, ...(data.commentCounts ?? {}) }));
      } else {
        const query = type === "all" ? "" : `?type=${type}`;
        const data = await fetchJson<{ posts: SocialPost[]; likeCounts?: Record<string, number>; commentCounts?: Record<string, number> }>(
          `/social/feed${query}`
        );
        setFeed(data.posts ?? []);
        setLikes((prev) => ({ ...prev, ...(data.likeCounts ?? {}) }));
        setCommentTotals((prev) => ({ ...prev, ...(data.commentCounts ?? {}) }));
      }
    } catch (err: any) {
      setStatus(err.message ?? "Failed to load feed");
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }

  async function postIntent() {
    if (!wallet) { openWalletModal(false); return; }
    setStatus(null);
    try {
      await postJson("/social/intents", {
        wallet,
        content: intentText,
        topic: intentTopic || undefined,
        tags: intentTags ? intentTags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      });
      setIntentText(""); setIntentTopic(""); setIntentTags("");
      await loadFeed();
    } catch (err: any) { setStatus(err.message ?? "Failed to post intent"); }
  }

  async function postSlash() {
    if (!wallet) { openWalletModal(false); return; }
    setStatus(null);
    try {
      await postJson("/social/slash", {
        wallet,
        content: slashText,
        streamId: slashStream || undefined,
        makerWallet: slashMakerWallet || undefined,
        challengeTx: slashTx || undefined,
      });
      setSlashText(""); setSlashStream(""); setSlashMakerWallet(""); setSlashTx("");
      await loadFeed();
    } catch (err: any) { setStatus(err.message ?? "Failed to post slash report"); }
  }

  async function toggleLike(contentId: string) {
    if (!wallet) { openWalletModal(true); return; }
    setStatus(null);
    const alreadyLiked = liked[contentId] ?? false;
    setLiked((prev) => ({ ...prev, [contentId]: !alreadyLiked }));
    setLikes((prev) => ({ ...prev, [contentId]: Math.max(0, (prev[contentId] ?? 0) + (alreadyLiked ? -1 : 1)) }));
    try {
      if (alreadyLiked) {
        await deleteJson("/social/likes", { wallet, contentId });
      } else {
        await postJson("/social/likes", { wallet, contentId });
      }
      const data = await fetchJson<{ count: number }>(`/social/likes?contentId=${encodeURIComponent(contentId)}`);
      setLikes((prev) => ({ ...prev, [contentId]: data.count }));
    } catch (err: any) {
      setLiked((prev) => ({ ...prev, [contentId]: alreadyLiked }));
      setLikes((prev) => ({ ...prev, [contentId]: Math.max(0, (prev[contentId] ?? 0) + (alreadyLiked ? 1 : -1)) }));
      setStatus(err.message ?? "Vote failed");
    }
  }

  async function followAuthor(profileId: string) {
    if (!wallet) { openWalletModal(true); return; }
    try {
      await postJson("/social/follow", { wallet, targetProfileId: profileId });
      setStatus("Following profile.");
    } catch (err: any) { setStatus(err.message ?? "Follow failed"); }
  }

  async function loadComments(contentId: string, page = 1) {
    try {
      setCommentLoading((prev) => ({ ...prev, [contentId]: true }));
      const data = await fetchJson<{ comments: CommentEntry[]; total?: number; page?: number }>(
        `/social/comments?contentId=${encodeURIComponent(contentId)}&page=${page}&pageSize=${COMMENTS_PAGE_SIZE}`
      );
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
      const data = await fetchJson<{ comments: CommentEntry[]; total?: number; page?: number }>(
        `/social/comments?contentId=${encodeURIComponent(contentId)}&page=${nextPage}&pageSize=${COMMENTS_PAGE_SIZE}`
      );
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
      await postJson("/social/comments", { wallet, contentId, comment: value });
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

      {/* ─── Left: X-style nav sidebar ─── */}
      <aside className="x-sidebar">
        <nav className="x-nav">
          {NAV_ITEMS.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`x-nav-item${pathname === href ? " x-nav-item--active" : ""}`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* ─── Center: tabs + composer + feed ─── */}
      <div className="social-main">

        {/* Tab bar */}
        <div className="feed-tabs-bar">
          {FEED_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`feed-tab${activeTab === tab.id ? " feed-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Composer */}
        <div className="x-composer" style={{ position: "relative" }}>
          <div className="x-composer-avatar">
            <AvatarCircle seed={wallet ?? "?"} />
          </div>
          <div className="x-composer-body">
            <div className="x-composer-mode-tabs">
              <button
                className={`x-mode-tab${composerMode === "intent" ? " x-mode-tab--active" : ""}`}
                onClick={() => setComposerMode("intent")}
              >
                Intent
              </button>
              <button
                className={`x-mode-tab${composerMode === "slash" ? " x-mode-tab--active" : ""}`}
                onClick={() => setComposerMode("slash")}
              >
                Slash report
              </button>
            </div>

            {composerMode === "intent" ? (
              <>
                <textarea
                  className="x-composer-textarea"
                  value={intentText}
                  onChange={(e) => setIntentText(e.target.value)}
                  placeholder="Share your market intelligence..."
                  rows={2}
                />
                <div className="x-composer-fields">
                  <input
                    className="input"
                    value={intentTopic}
                    onChange={(e) => setIntentTopic(e.target.value)}
                    placeholder="Topic (optional)"
                  />
                  <input
                    className="input"
                    value={intentTags}
                    onChange={(e) => setIntentTags(e.target.value)}
                    placeholder="Tags: eth, alerts, drop"
                  />
                </div>
                <div className="x-composer-footer">
                  <span className="subtext">Visible to all makers on the network.</span>
                  <button className="x-submit-btn" onClick={postIntent} disabled={!intentText}>
                    Post
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  className="x-composer-textarea"
                  value={slashText}
                  onChange={(e) => setSlashText(e.target.value)}
                  placeholder="Report a false or misleading signal..."
                  rows={2}
                />
                <div className="x-composer-fields">
                  <input className="input" value={slashStream} onChange={(e) => setSlashStream(e.target.value)} placeholder="Stream ID" />
                  <input className="input" value={slashMakerWallet} onChange={(e) => setSlashMakerWallet(e.target.value)} placeholder="Maker wallet" />
                  <input className="input" value={slashTx} onChange={(e) => setSlashTx(e.target.value)} placeholder="Challenge tx" />
                </div>
                <div className="x-composer-footer">
                  <span className="subtext">Triggers a public review thread.</span>
                  <button className="x-submit-btn" onClick={postSlash} disabled={!slashText}>
                    Report
                  </button>
                </div>
              </>
            )}
          </div>
          {!wallet && (
            <div className="composer-gate">
              <button className="button primary" onClick={() => openWalletModal(false)}>
                Connect wallet to post
              </button>
            </div>
          )}
        </div>

        {status && <div className="x-status-msg">{status}</div>}

        {/* Feed posts */}
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
              <p>No posts yet. Be the first to post an intent or slash report.</p>
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
                  <AvatarCircle seed={post.authorWallet} />
                </div>
                <div className="xpost-body">
                  <div className="xpost-header">
                    <span className="xpost-name">
                      {post.authorWallet.slice(0, 6)}…{post.authorWallet.slice(-4)}
                    </span>
                    <Link href={`/post/${post.contentId}`} className="xpost-time" title="View post">
                      · {timeAgo(post.createdAt)}
                    </Link>
                    <span className={`xpost-type-badge ${post.type}`}>
                      {post.type === "slash" ? "Slash" : "Intent"}
                    </span>
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
                          href={`https://explorer.solana.com/tx/${challengeTx}?cluster=devnet`}
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
                          {entry.comment ?? entry.text ?? (typeof entry.content === "string" ? entry.content : entry.content?.text) ?? "Comment"}
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

      {/* Wallet connect modal */}
      {walletModalOpen && createPortal(
        <div className="modal-overlay" onClick={() => setWalletModalOpen(false)}>
          <div className="modal-card wallet-modal" onClick={(e) => e.stopPropagation()}>
            <button className="wallet-modal-close" onClick={() => setWalletModalOpen(false)} aria-label="Close">✕</button>
            <span className="kicker">Solana</span>
            <h2>Connect a wallet</h2>
            <p className="subtext">
              {walletModalReason
                ? "To perform any activity, please connect your wallet."
                : "Choose an installed wallet to continue."}
            </p>
            <div className="wallet-list">
              {detectedWallets.length === 0 ? (
                <p className="subtext wallet-none">
                  No wallets detected. Install{" "}
                  <a href="https://backpack.app" target="_blank" rel="noopener noreferrer">Backpack</a>,{" "}
                  <a href="https://phantom.app" target="_blank" rel="noopener noreferrer">Phantom</a>, or{" "}
                  <a href="https://solflare.com" target="_blank" rel="noopener noreferrer">Solflare</a>.
                </p>
              ) : (
                detectedWallets.map((w) => (
                  <button
                    key={w.adapter.name}
                    className="wallet-option"
                    onClick={() => {
                      pendingConnect.current = true;
                      select(w.adapter.name);
                      setWalletModalOpen(false);
                    }}
                  >
                    <img src={w.adapter.icon} alt="" width={36} height={36} />
                    <span>{w.adapter.name}</span>
                    <span className="wallet-option-badge">Detected</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
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
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
