import { fetchSignalEvents as sdkFetchSignalEvents } from "../sdkBackend";
import type { SignalEvent } from "../types";

export type SignalEventsResponse = {
  events: SignalEvent[];
};

const SIGNALS_CACHE_KEY = "signal_events_cache_v1";
const SIGNALS_CACHE_TTL_MS = 30_000;

type SignalsCache = {
  expiresAt: number;
  data: SignalEventsResponse;
};

export function readSignalsCache(): SignalEventsResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIGNALS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignalsCache;
    if (!parsed?.data || !Array.isArray(parsed.data.events)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSignalsCache(data: SignalEventsResponse) {
  if (typeof window === "undefined") return;
  try {
    const payload: SignalsCache = {
      data,
      expiresAt: Date.now() + SIGNALS_CACHE_TTL_MS,
    };
    window.localStorage.setItem(SIGNALS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export async function fetchSignalEvents(params: {
  streamId?: string;
  limit?: number;
  after?: number;
}): Promise<SignalEventsResponse> {
  const data = await sdkFetchSignalEvents<SignalEvent>(params);
  if (!params.after && !params.streamId) {
    writeSignalsCache(data);
  }
  return data;
}
