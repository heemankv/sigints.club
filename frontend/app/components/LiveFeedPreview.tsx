"use client";

import { useState, useEffect } from "react";

type Post = {
  id: number;
  type: "intent" | "slash";
  content: string;
  wallet: string;
  votes: number;
  ago: string;
};

const DEMO_POSTS: Post[] = [
  {
    id: 1,
    type: "intent",
    content: "Need price alert when ETH crosses $3,800 on any major venue",
    wallet: "7xKp…m3Qz",
    votes: 14,
    ago: "2m ago",
  },
  {
    id: 2,
    type: "slash",
    content: "Amazon-Deal Scout sent stale Prime Day pricing — challenge submitted",
    wallet: "Bv2R…9nJk",
    votes: 8,
    ago: "5m ago",
  },
  {
    id: 3,
    type: "intent",
    content: "Looking for Solana airdrop announcement signals with <5s latency",
    wallet: "Dq8W…4tLm",
    votes: 21,
    ago: "9m ago",
  },
  {
    id: 4,
    type: "intent",
    content: "Bleach TYBW EP28 dropped — verified by Anime-Release Scout in 4.2s",
    wallet: "Hf3N…7pXa",
    votes: 33,
    ago: "12m ago",
  },
  {
    id: 5,
    type: "slash",
    content: "Signal hash mismatch on tier-eth-verifier — on-chain tx attached",
    wallet: "Rk5C…2wEy",
    votes: 6,
    ago: "18m ago",
  },
  {
    id: 6,
    type: "intent",
    content: "Need NFT floor price feeds from Magic Eden with verifier support",
    wallet: "Tz9L…5rFb",
    votes: 17,
    ago: "24m ago",
  },
];

export default function LiveFeedPreview() {
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setOffset((prev) => (prev + 1) % DEMO_POSTS.length);
        setVisible(true);
      }, 350);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const posts = [0, 1, 2].map((i) => DEMO_POSTS[(offset + i) % DEMO_POSTS.length]);

  return (
    <div className="module accent-orange">
      <div className="hud-corners" />
      <div className="live-header">
        <span className="kicker">Live feed</span>
        <span className="live-indicator">
          <span className="live-pulse" />
          Live
        </span>
      </div>
      <div className="live-posts" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.35s ease" }}>
        {posts.map((post) => (
          <div key={`${post.id}-${offset}`} className="live-post-item">
            <div className="live-post-body">
              <span className={`badge ${post.type === "slash" ? "accent" : ""}`}>
                {post.type === "slash" ? "Slash" : "Intent"}
              </span>
              <p className="live-post-text">{post.content}</p>
              <span className="subtext">{post.wallet} · {post.ago}</span>
            </div>
            <span className="live-post-votes">▲ {post.votes}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
