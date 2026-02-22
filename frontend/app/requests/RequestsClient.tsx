"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteJson, fetchJson, postJson } from "../lib/api";
import { useWallet } from "@solana/wallet-adapter-react";

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

type LikeResponse = { count: number };
type CommentEntry = {
  id?: string;
  comment?: string;
  content?: string | { text?: string };
  text?: string;
  profileId?: string;
  createdAt?: number;
};

const filters = [
  { label: "All", value: "all" },
  { label: "Trending", value: "trending" },
  { label: "Intents", value: "intent" },
  { label: "Slashing", value: "slash" },
];

export default function RequestsClient() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? process.env.NEXT_PUBLIC_TEST_WALLET;
  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const [intentText, setIntentText] = useState("");
  const [intentTopic, setIntentTopic] = useState("");
  const [intentTags, setIntentTags] = useState("");

  const [slashText, setSlashText] = useState("");
  const [slashStream, setSlashStream] = useState("");
  const [slashMakerWallet, setSlashMakerWallet] = useState("");
  const [slashTx, setSlashTx] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, CommentEntry[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const filteredFeed = useMemo(() => {
    if (filter === "all" || filter === "trending") return feed;
    return feed.filter((item) => item.type === filter);
  }, [feed, filter]);

  useEffect(() => {
    void loadFeed();
  }, [filter]);

  async function loadFeed() {
    setLoading(true);
    setStatus(null);
    try {
      if (filter === "trending") {
        const data = await fetchJson<{ posts: SocialPost[]; likeCounts: Record<string, number> }>(
          "/social/feed/trending"
        );
        setFeed(data.posts);
        setLikes(data.likeCounts ?? {});
      } else {
        const query = filter === "all" ? "" : `?type=${filter}`;
        const data = await fetchJson<{ posts: SocialPost[] }>(`/social/feed${query}`);
        setFeed(data.posts);
      }
    } catch (err: any) {
      setStatus(err.message ?? "Failed to load feed");
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
      setIntentTags("");
      setIntentTopic("");
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

  async function loadLikes(contentId: string) {
    try {
      const data = await fetchJson<LikeResponse>(`/social/likes?contentId=${encodeURIComponent(contentId)}`);
      setLikes((prev) => ({ ...prev, [contentId]: data.count }));
    } catch {
    }
  }

  async function followAuthor(profileId: string) {
    if (!wallet) {
      setStatus("Connect your wallet to follow.");
      return;
    }
    try {
      await postJson("/social/follow", { wallet, targetProfileId: profileId });
      setStatus("Followed profile.");
    } catch (err: any) {
      setStatus(err.message ?? "Follow failed");
    }
  }

  async function vote(contentId: string) {
    if (!wallet) {
      setStatus("Connect your wallet to vote.");
      return;
    }
    setStatus(null);
    try {
      await postJson("/social/likes", { wallet, contentId });
      await loadLikes(contentId);
    } catch (err: any) {
      setStatus(err.message ?? "Vote failed");
    }
  }

  async function unvote(contentId: string) {
    if (!wallet) {
      setStatus("Connect your wallet to remove vote.");
      return;
    }
    setStatus(null);
    try {
      await deleteJson("/social/likes", { wallet, contentId });
      await loadLikes(contentId);
    } catch (err: any) {
      setStatus(err.message ?? "Unvote failed");
    }
  }

  async function loadComments(contentId: string) {
    try {
      const data = await fetchJson<{ comments: CommentEntry[] }>(
        `/social/comments?contentId=${encodeURIComponent(contentId)}`
      );
      setComments((prev) => ({ ...prev, [contentId]: data.comments }));
    } catch {
    }
  }

  async function postComment(contentId: string) {
    if (!wallet) {
      setStatus("Connect your wallet to comment.");
      return;
    }
    const value = commentDraft[contentId];
    if (!value) {
      return;
    }
    try {
      await postJson("/social/comments", { wallet, contentId, comment: value });
      setCommentDraft((prev) => ({ ...prev, [contentId]: "" }));
      await loadComments(contentId);
    } catch (err: any) {
      setStatus(err.message ?? "Comment failed");
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="kicker">Social layer</span>
        <h1>Intents and Slashing Feed</h1>
        <p>Post what you want, or report a slash challenge. Votes and comments are powered by Tapestry.</p>
      </div>

      <div className="module-grid">
        <div className="module card">
          <div className="hud-corners" />
          <h3>Post Intent</h3>
          <textarea
            value={intentText}
            onChange={(e) => setIntentText(e.target.value)}
            placeholder="Looking for: ETH price alert / HDFC credit card open / anime drop..."
          />
          <div className="field">
            <label>Topic</label>
            <input value={intentTopic} onChange={(e) => setIntentTopic(e.target.value)} placeholder="topic / domain" />
          </div>
          <div className="field">
            <label>Tags (comma separated)</label>
            <input value={intentTags} onChange={(e) => setIntentTags(e.target.value)} placeholder="eth, alerts, defi" />
          </div>
          <button className="button primary" onClick={postIntent} disabled={!intentText}>
            Post Intent
          </button>
        </div>

        <div className="module card">
          <div className="hud-corners" />
          <h3>Slash Report</h3>
          <textarea
            value={slashText}
            onChange={(e) => setSlashText(e.target.value)}
            placeholder="Describe why this maker should be slashed..."
          />
          <div className="field">
            <label>Stream</label>
            <input value={slashStream} onChange={(e) => setSlashStream(e.target.value)} placeholder="stream-eth" />
          </div>
          <div className="field">
            <label>Maker Wallet</label>
            <input value={slashMakerWallet} onChange={(e) => setSlashMakerWallet(e.target.value)} placeholder="maker pubkey" />
          </div>
          <div className="field">
            <label>Challenge Tx</label>
            <input value={slashTx} onChange={(e) => setSlashTx(e.target.value)} placeholder="tx signature" />
          </div>
          <button className="button ghost" onClick={postSlash} disabled={!slashText}>
            Post Slash Report
          </button>
        </div>
      </div>

      <div className="section-title">
        <span>Feed</span>
        <div className="chip-row">
          {filters.map((f) => (
            <button
              key={f.value}
              className={`chip ${filter === f.value ? "chip--active" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {status && <p className="subtext">{status}</p>}

      <div className="stream">
        {loading && <div className="stream-item">Loading feed…</div>}
        {!loading && filteredFeed.length === 0 && <div className="stream-item">No posts yet.</div>}
        {filteredFeed.map((post) => {
          const likeCount = likes[post.contentId];
          const postComments = comments[post.contentId] ?? [];
          const challengeTx = post.customProperties?.challengeTx;
          return (
            <div className="stream-item" key={post.id}>
              <div>
                <strong>{post.type === "intent" ? "Intent" : "Slash Report"}</strong>
                <div className="subtext">
                  {new Date(post.createdAt).toLocaleString()} · {post.authorWallet.slice(0, 10)}…
                </div>
                <p>{post.content}</p>
                {post.customProperties?.streamId && (
                  <div className="subtext">Stream: {post.customProperties.streamId}</div>
                )}
                {post.customProperties?.tags && (
                  <div className="subtext">Tags: {post.customProperties.tags}</div>
                )}
                {challengeTx && (
                  <div className="subtext">
                    Challenge{" "}
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
              <div className="stream-actions">
                <button className="button ghost" onClick={() => followAuthor(post.profileId)}>
                  Follow
                </button>
                <button className="button ghost" onClick={() => vote(post.contentId)}>
                  Vote
                </button>
                <button className="button ghost" onClick={() => unvote(post.contentId)}>
                  Remove Vote
                </button>
                <button className="button ghost" onClick={() => loadLikes(post.contentId)}>
                  {likeCount === undefined ? "Load Votes" : `Votes: ${likeCount}`}
                </button>
                <button className="button ghost" onClick={() => loadComments(post.contentId)}>
                  {postComments.length ? `Comments: ${postComments.length}` : "Load Comments"}
                </button>
              </div>
              <div className="comment-box">
                <textarea
                  value={commentDraft[post.contentId] ?? ""}
                  onChange={(e) => setCommentDraft((prev) => ({ ...prev, [post.contentId]: e.target.value }))}
                  placeholder="Add a comment"
                />
                <button className="button primary" onClick={() => postComment(post.contentId)}>
                  Post Comment
                </button>
                {postComments.length > 0 && (
                  <div className="comment-list">
                    {postComments.map((c, idx) => {
                      const content =
                        typeof c.comment === "string"
                          ? c.comment
                          : typeof c.text === "string"
                            ? c.text
                            : typeof c.content === "string"
                              ? c.content
                              : typeof c.content === "object" && c.content?.text
                                ? c.content.text
                                : "Comment";
                      return (
                      <div key={`${post.contentId}-comment-${idx}`} className="comment-item">
                        <p>{content}</p>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
