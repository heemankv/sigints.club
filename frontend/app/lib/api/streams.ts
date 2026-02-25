// Typed API layer for stream endpoints (SDK-backed).

import { fetchStream as sdkFetchStream, fetchStreams as sdkFetchStreams, fetchStreamSubscribers as sdkFetchStreamSubscribers } from "../sdkBackend";
import type { StreamDetail } from "../types";

const STREAMS_CACHE_KEY = "streams_cache_v1";
const STREAMS_CACHE_TTL_MS = 30_000;

type StreamsCache = {
  expiresAt: number;
  data: { streams: StreamDetail[] };
};

/**
 * Read streams from localStorage cache.
 * By default returns data even if stale (expired TTL) so the UI is never empty.
 * Pass `{ strict: true }` to return null when the cache has expired.
 */
export function readStreamsCache(opts?: { strict?: boolean }): { streams: StreamDetail[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STREAMS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StreamsCache;
    if (!parsed?.data || !Array.isArray(parsed.data.streams)) return null;
    if (opts?.strict && Date.now() > parsed.expiresAt) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeStreamsCache(data: { streams: StreamDetail[] }) {
  if (typeof window === "undefined") return;
  try {
    const payload: StreamsCache = {
      data,
      expiresAt: Date.now() + STREAMS_CACHE_TTL_MS,
    };
    window.localStorage.setItem(STREAMS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export async function fetchStreams(opts?: {
  includeTiers?: boolean;
}): Promise<{ streams: StreamDetail[] }> {
  const data = await sdkFetchStreams<StreamDetail>(opts?.includeTiers);
  writeStreamsCache(data);
  return data;
}

export async function fetchStream(id: string): Promise<{ stream: StreamDetail }> {
  const stream = await sdkFetchStream<StreamDetail>(id);
  return { stream };
}

export async function fetchStreamSubscribers(streamId: string): Promise<{ count: number }> {
  return sdkFetchStreamSubscribers(streamId);
}

// ─── Stream Stats (analytics) ────────────────────────────────────────────────

const STREAM_STATS_CACHE_KEY = "stream_stats_cache_v1";
const STREAM_STATS_CACHE_TTL_MS = 30_000;

export type StreamStats = {
  streamCount: number;
  totalSubscribers: number;
};

export function readStreamStatsCache(wallet: string): StreamStats | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STREAM_STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.wallet !== wallet) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeStreamStatsCache(wallet: string, data: StreamStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STREAM_STATS_CACHE_KEY,
      JSON.stringify({ wallet, data, expiresAt: Date.now() + STREAM_STATS_CACHE_TTL_MS })
    );
  } catch {}
}
