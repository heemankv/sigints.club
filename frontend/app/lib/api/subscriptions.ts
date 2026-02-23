import { fetchOnchainSubscriptions as sdkFetchOnchainSubscriptions } from "../sdkBackend";
import type { OnChainSubscription } from "../types";

export async function fetchOnchainSubscriptions(
  subscriber: string,
  opts?: { fresh?: boolean }
): Promise<{ subscriptions: OnChainSubscription[] }> {
  return sdkFetchOnchainSubscriptions<OnChainSubscription>(subscriber, opts);
}
