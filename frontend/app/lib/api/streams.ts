// Typed API layer for stream endpoints.

import { fetchJson } from "../api";
import type { StreamDetail } from "../types";

export async function fetchStreams(opts?: {
  includeTiers?: boolean;
}): Promise<{ streams: StreamDetail[] }> {
  const query = opts?.includeTiers ? "?includeTiers=true" : "";
  return fetchJson<{ streams: StreamDetail[] }>(`/streams${query}`);
}

export async function fetchStream(id: string): Promise<{ stream: StreamDetail }> {
  return fetchJson<{ stream: StreamDetail }>(`/streams/${encodeURIComponent(id)}?includeTiers=true`);
}
