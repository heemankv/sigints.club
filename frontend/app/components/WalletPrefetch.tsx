"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams } from "../lib/api/streams";
import { fetchFeed } from "../lib/api/social";
import { fetchOnchainSubscriptions } from "../lib/api/subscriptions";
import { fetchAgents, fetchAgentSubscriptions } from "../lib/api/agents";

const POLL_INTERVAL_MS = 30_000;

/**
 * Invisible component that warms all localStorage caches as soon as
 * a wallet connects, then keeps them warm on a 30s polling interval.
 */
export default function WalletPrefetch() {
  const { publicKey } = useWallet();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prefetch = useCallback((wallet: string) => {
    void fetchStreams({ includeTiers: true }).catch(() => {});
    void fetchFeed().catch(() => {});
    void fetchOnchainSubscriptions(wallet).catch(() => {});
    void fetchAgents({ owner: wallet }).catch(() => {});
    void fetchAgentSubscriptions({ owner: wallet }).catch(() => {});
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const wallet = publicKey?.toBase58() ?? null;
    if (!wallet) return;

    // Immediate fetch on connect
    prefetch(wallet);

    // Keep caches warm every 30s
    intervalRef.current = setInterval(() => prefetch(wallet), POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [publicKey, prefetch]);

  return null;
}
