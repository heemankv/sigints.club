import { fetchOnchainSubscriptions as sdkFetchOnchainSubscriptions } from "../sdkBackend";
import type { OnChainSubscription } from "../types";

const SUBS_CACHE_KEY = "subscriptions_cache_v1";
const SUBS_CACHE_TTL_MS = 30_000;

type SubsCache = {
  expiresAt: number;
  wallet: string;
  data: { subscriptions: OnChainSubscription[] };
};

export function readSubscriptionsCache(wallet: string): { subscriptions: OnChainSubscription[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SUBS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubsCache;
    if (parsed.wallet !== wallet) return null;
    if (!parsed?.data || !Array.isArray(parsed.data.subscriptions)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSubscriptionsCache(wallet: string, data: { subscriptions: OnChainSubscription[] }) {
  if (typeof window === "undefined") return;
  try {
    const payload: SubsCache = {
      data,
      wallet,
      expiresAt: Date.now() + SUBS_CACHE_TTL_MS,
    };
    window.localStorage.setItem(SUBS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export async function fetchOnchainSubscriptions(
  subscriber: string,
  opts?: { fresh?: boolean }
): Promise<{ subscriptions: OnChainSubscription[] }> {
  const data = await sdkFetchOnchainSubscriptions<OnChainSubscription>(subscriber, opts);
  writeSubscriptionsCache(subscriber, data);
  return data;
}
