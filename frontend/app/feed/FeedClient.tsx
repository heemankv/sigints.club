"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteJson, fetchJson, postJson } from "../lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
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

const scopeFilters = [
  { label: "All", value: "all" },
  { label: "Following", value: "following" },
];

const typeFilters = [
  { label: "All", value: "all" },
  { label: "Intents", value: "intent" },
  { label: "Slashing", value: "slash" },
];

const COMMENTS_PAGE_SIZE = 3;

export default function FeedClient({ searchQuery }: FeedClientProps) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? process.env.NEXT_PUBLIC_TEST_WALLET;
  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [trending, setTrending] = useState<SocialPost[]>([]);
  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedScope, setFeedScope] = useState<"all" | "following">("all");
  const [feedType, setFeedType] = useState<"all" | "intent" | "slash">("all");
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
  }, [feedScope, feedType]);

  useEffect(() => {
    void loadSidebar();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadBots() {
      if (!searchLabel) {
        setBots([]);
        return;
      }
      try {
        const data = await fetchJson<{ bots: BotProfile[] }>(`/bots?search=${encodeURIComponent(searchLabel)}`);
        if (mounted) {
          setBots(data.bots);
        }
      } catch {
        if (mounted) {
          setBots([]);
        }
      }
    }
    loadBots();
    return () => {
      mounted = false;
    };
  }, [searchLabel]);

  async function loadSidebar() {
    try {
      const trendingData = await fetchJson<{ posts: SocialPost[]; likeCounts: Record<string, number>; commentCounts?: Record<string, number> }>(
        "/social/feed/trending?limit=6"
      );
      setTrending(trendingData.posts ?? []);
      setLikes((prev) => ({ ...prev, ...(trendingData.likeCounts ?? {}) }));
      setCommentTotals((prev) => ({ ...prev, ...(trendingData.commentCounts ?? {}) }));
    } catch {
      setTrending([]);
    }
    try {
      const data = await fetchJson<{ streams: StreamDetail[] }>("/streams?includeTiers=true");
      setStreams(data.streams ?? []);
    } catch {
      setStreams([]);
    }
  }

  async function loadFeed() {
    setLoading(true);
    setStatus(null);
    setOpenComments({});
    try {
      if (feedScope === "following") {
        if (!wallet) {
          setFeed([]);
          setStatus("Connect your wallet to view your following feed.");
          return;
        }
        const query = feedType === "all" ? "" : `&type=${feedType}`;
        const data = await fetchJson<{ posts: SocialPost[]; likeCounts?: Record<string, number>; commentCounts?: Record<string, number> }>(
          `/social/feed?scope=following&wallet=${encodeURIComponent(wallet)}${query}`
        );
        setFeed(data.posts ?? []);
        setLikes((prev) => ({ ...prev, ...(data.likeCounts ?? {}) }));
        setCommentTotals((prev) => ({ ...prev, ...(data.commentCounts ?? {}) }));
      } else {
        const query = feedType === "all" ? "" : `?type=${feedType}`;
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
    if (!wallet) {
      setStatus("Connect your wallet to post.");
      return;
    }
    setStatus(null);
    try {
      await postJson("/social/intents", {
        wallet,
        content: intentText,
        topic: intentTopic || undefined,
        tags: intentTags ? intentTags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      });
      setIntentText("");
      setIntentTopic("");
      setIntentTags("");
      await loadFeed();
    } catch (err: any) {
      setStatus(err.message ?? "Failed to post intent");
    }
  }

  async function postSlash() {
    if (!wallet) {
      setStatus("Connect your wallet to post.");
      return;
    }
    setStatus(null);
    try {
      await postJson("/social/slash", {
        wallet,
        content: slashText,
        streamId: slashStream || undefined,
        makerWallet: slashMakerWallet || undefined,
        challengeTx: slashTx || undefined,
      });
      setSlashText("");
      setSlashStream("");
      setSlashMakerWallet("");
      setSlashTx("");
      await loadFeed();
    } catch (err: any) {
      setStatus(err.message ?? "Failed to post slash report");
    }
  }

  async function toggleLike(contentId: string) {
    if (!wallet) {
      setStatus("Connect your wallet to vote.");
      return;
    }
    setStatus(null);
    const alreadyLiked = liked[contentId] ?? false;
    setLiked((prev) => ({ ...prev, [contentId]: !alreadyLiked }));
    setLikes((prev) => ({
      ...prev,
      [contentId]: Math.max(0, (prev[contentId] ?? 0) + (alreadyLiked ? -1 : 1)),
    }));
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
    if (!wallet) {
      setStatus("Connect your wallet to follow.");
      return;
    }
    try {
      await postJson("/social/follow", { wallet, targetProfileId: profileId });
      setStatus("Following profile.");
    } catch (err: any) {
      setStatus(err.message ?? "Follow failed");
    }
  }

  async function loadComments(contentId: string, page = 1) {
    try {
      setCommentLoading((prev) => ({ ...prev, [contentId]: true }));
      const data = await fetchJson<{ comments: CommentEntry[]; total?: number; page?: number; pageSize?: number }>(
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
    if (!wallet) {
      setStatus("Connect your wallet to comment.");
      return;
    }
    const value = commentDraft[contentId];
    if (!value) return;
    const optimistic: CommentEntry = {
      comment: value,
      createdAt: Date.now(),
    };
    setComments((prev) => ({
      ...prev,
      [contentId]: [...(prev[contentId] ?? []), optimistic],
    }));
    setCommentTotals((prev) => ({ ...prev, [contentId]: (prev[contentId] ?? 0) + 1 }));
    try {
      await postJson("/social/comments", { wallet, contentId, comment: value });
      setCommentDraft((prev) => ({ ...prev, [contentId]: "" }));
      setCommentPages((prev) => ({ ...prev, [contentId]: 1 }));
      await loadComments(contentId, 1);
    } catch (err: any) {
      setComments((prev) => ({
        ...prev,
        [contentId]: (prev[contentId] ?? []).filter((entry) => entry !== optimistic),
      }));
      setCommentTotals((prev) => ({ ...prev, [contentId]: Math.max(0, (prev[contentId] ?? 1) - 1) }));
      setStatus(err.message ?? "Comment failed");
    }
  }

  function resolveTags(post: SocialPost) {
    const raw = post.customProperties?.tags;
    if (!raw) return [];
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
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
    <section className="section social-shell">
      <aside className="social-rail">
        <div className="module accent-teal">
          <div className="hud-corners" />
          <span className="kicker">Trendline</span>
          <h3>Top makers</h3>
          <p className="subtext">The most subscribed streams this week.</p>
          <div className="list">
            {streams.slice(0, 4).map((stream) => (
              <div className="row" key={stream.id}>
                <div>
                  <strong>{stream.name}</strong>
                  <div className="subtext">{stream.domain}</div>
                </div>
                <span className="badge">{stream.evidence}</span>
              </div>
            ))}
            {!streams.length && <div className="subtext">No stream data yet.</div>}
          </div>
          <div className="divider" />
          <a className="button ghost" href="/">
            Open discovery
          </a>
        </div>
      </aside>

      <div className="social-main">
        <div className="section-head">
          <span className="kicker">Live social layer</span>
          <h1>Network Feed</h1>
          <p>Publish intents, watch slash reports, and subscribe to the best makers in real-time.</p>
        </div>

        <div className="module composer">
          <div className="hud-corners" />
          <div className="composer-tabs">
            <button
              className={`chip ${composerMode === "intent" ? "chip--active" : ""}`}
              onClick={() => setComposerMode("intent")}
            >
              Intent
            </button>
            <button
              className={`chip ${composerMode === "slash" ? "chip--active" : ""}`}
              onClick={() => setComposerMode("slash")}
            >
              Slash report
            </button>
          </div>
          {composerMode === "intent" ? (
            <>
              <textarea
                value={intentText}
                onChange={(e) => setIntentText(e.target.value)}
                placeholder="Looking for: ETH price alerts, iPhone exchange availability, anime drop..."
              />
              <div className="composer-grid">
                <div className="field">
                  <label>Topic</label>
                  <input
                    className="input"
                    value={intentTopic}
                    onChange={(e) => setIntentTopic(e.target.value)}
                    placeholder="pricing, ecommerce, media"
                  />
                </div>
                <div className="field">
                  <label>Tags</label>
                  <input
                    className="input"
                    value={intentTags}
                    onChange={(e) => setIntentTags(e.target.value)}
                    placeholder="eth, alerts, drop"
                  />
                </div>
              </div>
              <div className="composer-actions">
                <button className="button primary" onClick={postIntent} disabled={!intentText}>
                  Post intent
                </button>
                <span className="subtext">Visible to all makers on the network.</span>
              </div>
            </>
          ) : (
            <>
              <textarea
                value={slashText}
                onChange={(e) => setSlashText(e.target.value)}
                placeholder="Report a bad signal or questionable maker performance..."
              />
              <div className="composer-grid">
                <div className="field">
                  <label>Stream ID</label>
                  <input
                    className="input"
                    value={slashStream}
                    onChange={(e) => setSlashStream(e.target.value)}
                    placeholder="stream-eth"
                  />
                </div>
                <div className="field">
                  <label>Maker wallet</label>
                  <input
                    className="input"
                    value={slashMakerWallet}
                    onChange={(e) => setSlashMakerWallet(e.target.value)}
                    placeholder="Maker public key"
                  />
                </div>
                <div className="field">
                  <label>Challenge tx</label>
                  <input
                    className="input"
                    value={slashTx}
                    onChange={(e) => setSlashTx(e.target.value)}
                    placeholder="Solana tx hash"
                  />
                </div>
              </div>
              <div className="composer-actions">
                <button className="button primary" onClick={postSlash} disabled={!slashText}>
                  Submit slash report
                </button>
                <span className="subtext">Triggers a public review thread.</span>
              </div>
            </>
          )}
          {status && <div className="subtext">{status}</div>}
        </div>

        <div className="feed-filters">
          <div className="chip-row">
            {scopeFilters.map((item) => (
              <button
                key={item.value}
                className={`chip ${feedScope === item.value ? "chip--active" : ""}`}
                onClick={() => setFeedScope(item.value as "all" | "following")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {typeFilters.map((item) => (
              <button
                key={item.value}
                className={`chip ${feedType === item.value ? "chip--active" : ""}`}
                onClick={() => setFeedType(item.value as "all" | "intent" | "slash")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="feed-list">
          {loading && <div className="subtext">Loading feed…</div>}
          {loading && (
            <div className="feed-skeleton">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div className="panel social-card shimmer" key={`shimmer-${idx}`}>
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                  <div className="skeleton-actions">
                    <div className="skeleton-pill" />
                    <div className="skeleton-pill" />
                    <div className="skeleton-pill" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && !feed.length && (
            <div className="module accent-orange">
              <div className="hud-corners" />
              <h3>No posts yet</h3>
              <p>Be the first to post an intent or slash report.</p>
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
            const totalComments = commentTotals[post.contentId] ?? comments[post.contentId]?.length ?? 0;
            const loadedComments = comments[post.contentId]?.length ?? 0;
            return (
              <div className="panel social-card" key={post.id}>
                <div className="social-card__header">
                  <div className="social-card__meta">
                    <span className={`badge ${post.type === "slash" ? "accent" : ""}`}>
                      {post.type === "slash" ? "Slash report" : "Intent"}
                    </span>
                    <span className="subtext">{new Date(post.createdAt).toLocaleString()}</span>
                  </div>
                  <button className="chip" onClick={() => followAuthor(post.profileId)}>
                    Follow
                  </button>
                </div>
                <div>
                  <strong>{post.content}</strong>
                  <div className="subtext">Posted by {post.authorWallet.slice(0, 10)}…</div>
                </div>
                <div className="chip-row">
                  {streamId && (
                    <a className="chip" href={`/stream/${streamId}`}>
                      {streamDetails?.name ?? streamId}
                    </a>
                  )}
                  {topic && <span className="chip">{topic}</span>}
                  {tags.slice(0, 3).map((tag) => (
                    <span className="chip" key={`${post.id}-${tag}`}>{tag}</span>
                  ))}
                </div>
                {(streamId || topic || makerWallet || challengeTx) && (
                  <div className="social-card__details">
                    {streamId && (
                      <div className="subtext">
                        Stream: <a className="link" href={`/stream/${streamId}`}>{streamId}</a>
                      </div>
                    )}
                    {topic && <div className="subtext">Topic: {topic}</div>}
                    {makerWallet && <div className="subtext">Maker: {makerWallet.slice(0, 10)}…</div>}
                    {challengeTx && (
                      <div className="subtext">
                        Challenge tx{" "}
                        <a
                          className="link"
                          href={`https://explorer.solana.com/tx/${challengeTx}?cluster=devnet`}
                          target="_blank"
                        >
                          {challengeTx.slice(0, 10)}…
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <div className="social-actions">
                  <button className="button ghost" onClick={() => toggleLike(post.contentId)}>
                    {liked[post.contentId] ? "Liked" : "Vote"} · {likes[post.contentId] ?? 0}
                  </button>
                  <button
                    className="button ghost"
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
                    {isOpen ? "Hide comments" : `Comments · ${totalComments}`}
                  </button>
                  {streamId && (
                    <button className="button primary" onClick={() => openSubscribe(streamId)}>
                      Subscribe
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="comment-box">
                    <div className="comment-list">
                      {commentLoading[post.contentId] && (comments[post.contentId]?.length ?? 0) === 0 && (
                        <div className="comment-skeleton">
                          {Array.from({ length: 2 }).map((_, idx) => (
                            <div className="comment-item shimmer" key={`comment-shimmer-${post.contentId}-${idx}`}>
                              <div className="skeleton-line" />
                            </div>
                          ))}
                        </div>
                      )}
                      {(comments[post.contentId] ?? []).map((entry, idx) => (
                        <div key={`${post.contentId}-${idx}`} className="comment-item">
                          {entry.comment ?? entry.text ?? (typeof entry.content === "string" ? entry.content : entry.content?.text) ?? "Comment"}
                        </div>
                      ))}
                      {loadedComments === 0 && (
                        <div className="subtext">No comments yet.</div>
                      )}
                    </div>
                    {loadedComments < totalComments && (
                      <button className="button ghost" onClick={() => loadMoreComments(post.contentId)}>
                        Load more
                      </button>
                    )}
                    <div className="comment-input">
                      <input
                        className="input"
                        placeholder="Add a comment"
                        value={commentDraft[post.contentId] ?? ""}
                        onChange={(e) =>
                          setCommentDraft((prev) => ({ ...prev, [post.contentId]: e.target.value }))
                        }
                      />
                      <button className="button ghost" onClick={() => postComment(post.contentId)}>
                        Post
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <aside className="social-rail">
        <div className="module accent-orange">
          <div className="hud-corners" />
          <span className="kicker">Trending</span>
          <h3>Hot intents</h3>
          <div className="list">
            {trending.map((post) => (
              <div className="row" key={post.id}>
                <div>
                  <strong>{post.content.slice(0, 42)}{post.content.length > 42 ? "…" : ""}</strong>
                  <div className="subtext">{post.authorWallet.slice(0, 10)}…</div>
                </div>
                <span className="badge">Votes {likes[post.contentId] ?? 0}</span>
              </div>
            ))}
            {!trending.length && <div className="subtext">No trending posts yet.</div>}
          </div>
        </div>

        <div className="module">
          <div className="hud-corners" />
          <h3>Search results</h3>
          <p className="subtext">Use the top search bar to find makers.</p>
          {searchLabel && <div className="divider" />}
          {searchLabel && (
            <>
              <p className="subtext">Results for “{searchLabel}”</p>
              <div className="list">
                {bots.map((bot) => (
                  <div className="row" key={bot.id}>
                    <div>
                      <strong>{bot.name}</strong>
                      <div className="subtext">{bot.domain} · {bot.role}</div>
                    </div>
                    <span className="badge">{bot.evidence}</span>
                  </div>
                ))}
                {!bots.length && <div className="subtext">No makers found.</div>}
              </div>
            </>
          )}
          {!searchLabel && <div className="subtext">Try “eth”, “anime”, or “pricing”.</div>}
        </div>
      </aside>

      {subscribeStreamId && (
        <div className="modal-overlay" onClick={closeSubscribe}>
          <div className="modal-card subscribe-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={closeSubscribe} aria-label="Close">
              ×
            </button>
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
