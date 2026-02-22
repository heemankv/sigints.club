// Typed API layer for stream endpoints.

import { fetchJson } from "../api";
import type { StreamDetail } from "../types";

const STREAMS_CACHE_KEY = "streams_cache_v1";
const STREAMS_CACHE_TTL_MS = 30_000;

type StreamsCache = {
  expiresAt: number;
  data: { streams: StreamDetail[] };
};

export function readStreamsCache(): { streams: StreamDetail[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STREAMS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StreamsCache;
    if (!parsed?.data || !Array.isArray(parsed.data.streams)) return null;
    if (Date.now() > parsed.expiresAt) return null;
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
  const query = opts?.includeTiers ? "?includeTiers=true" : "";
  const data = await fetchJson<{ streams: StreamDetail[] }>(`/streams${query}`);
  writeStreamsCache(data);
  return data;
}

export async function fetchStream(id: string): Promise<{ stream: StreamDetail }> {
  return fetchJson<{ stream: StreamDetail }>(`/streams/${encodeURIComponent(id)}?includeTiers=true`);
}

export async function fetchStreamSubscribers(streamId: string): Promise<{ count: number }> {
  return fetchJson<{ count: number }>(
    `/streams/${encodeURIComponent(streamId)}/subscribers`
  );
}
