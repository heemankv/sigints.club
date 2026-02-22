// Shared utility functions used across the frontend.

import type { CommentEntry } from "./types";

// ─── Time formatting ──────────────────────────────────────────────────────────

/** Short relative time: "5s", "12m", "3h", or a locale date string. */
export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Full timestamp: "3:42 PM · Feb 22, 2026" */
export function formatFullTimestamp(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${time} · ${date}`;
}

// ─── Comment text resolution ──────────────────────────────────────────────────

/** Resolves the display text from the API's polymorphic CommentEntry shape. */
export function resolveCommentText(entry: CommentEntry): string {
  return (
    entry.comment ??
    entry.text ??
    (typeof entry.content === "string"
      ? entry.content
      : entry.content?.text) ??
    ""
  );
}

// ─── Quota parsing ────────────────────────────────────────────────────────────

/** Extracts the integer from a quota string like "100 calls/mo". Returns undefined if absent. */
export function parseQuota(input?: string): number | undefined {
  if (!input) return undefined;
  const match = input.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

// ─── Hex encoding ─────────────────────────────────────────────────────────────

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Wallet address formatting ────────────────────────────────────────────────

/** "ABcd…XY12" */
export function shortWallet(address: string, head = 6, tail = 4): string {
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
