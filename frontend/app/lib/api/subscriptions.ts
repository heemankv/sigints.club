import { fetchJson } from "../api";
import type { OnChainSubscription } from "../types";

export async function fetchOnchainSubscriptions(subscriber: string): Promise<{ subscriptions: OnChainSubscription[] }> {
  return fetchJson<{ subscriptions: OnChainSubscription[] }>(
    `/subscriptions/onchain?subscriber=${encodeURIComponent(subscriber)}`
  );
}
