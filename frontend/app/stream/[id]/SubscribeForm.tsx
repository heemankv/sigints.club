"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildSubscribeTransaction,
  defaultExpiryMs,
  resolveProgramId,
  hasRegisteredSubscriptionKey,
  resolveStreamPubkey,
} from "../../lib/solana";
import { parseSolLamports } from "../../lib/pricing";
import { parseQuota } from "../../lib/utils";
import { registerSubscription } from "../../lib/sdkBackend";
import { readSubscriptionsCache, fetchOnchainSubscriptions } from "../../lib/api/subscriptions";
import { toast } from "../../lib/toast";

export default function SubscribeForm({
  streamId,
  tierId,
  pricingType,
  evidenceLevel,
  price,
  quota,
  streamOnchainAddress,
  streamAuthority,
  streamDao,
  streamVisibility,
  onSubscribed,
}: {
  streamId: string;
  tierId: string;
  pricingType: string;
  evidenceLevel: string;
  price: string;
  quota?: string;
  streamOnchainAddress?: string;
  streamAuthority?: string;
  streamDao?: string;
  streamVisibility?: "public" | "private";
  onSubscribed?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionKeyReady, setSubscriptionKeyReady] = useState<boolean | null>(null);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const visibility = streamVisibility ?? "private";
  const requiresKey = visibility === "private";
  const isOwner = Boolean(
    publicKey &&
      streamAuthority &&
      publicKey.toBase58() === streamAuthority
  );

  useEffect(() => {
    let active = true;
    async function checkSubscriptionKey() {
      if (!publicKey) {
        setSubscriptionKeyReady(null);
        return;
      }
      if (!requiresKey) {
        setSubscriptionKeyReady(true);
        return;
      }
      if (!streamOnchainAddress) {
        setSubscriptionKeyReady(false);
        return;
      }
      try {
        const programId = resolveProgramId();
        const streamPubkey = resolveStreamPubkey(streamOnchainAddress);
        const registered = await hasRegisteredSubscriptionKey(connection, programId, streamPubkey, publicKey);
        if (!active) return;
        setSubscriptionKeyReady(registered);
      } catch {
        if (!active) return;
        setSubscriptionKeyReady(false);
      }
    }
    void checkSubscriptionKey();
    const handleKeyUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ streamId?: string }>).detail;
      if (detail?.streamId && detail.streamId !== streamId) {
        return;
      }
      void checkSubscriptionKey();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("subscriptionKeyUpdated", handleKeyUpdate as EventListener);
    }
    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("subscriptionKeyUpdated", handleKeyUpdate as EventListener);
      }
    };
  }, [publicKey, connection, requiresKey, streamOnchainAddress, streamId]);

  useEffect(() => {
    let active = true;
    const wallet = publicKey?.toBase58() ?? null;
    if (!wallet || !streamOnchainAddress) return;

    function isSubscribedTo(subs: { subscriptions: { stream: string; status: number }[] } | null) {
      if (!subs?.subscriptions) return false;
      return subs.subscriptions.some((s) => s.status === 0 && s.stream === streamOnchainAddress);
    }

    const cached = readSubscriptionsCache(wallet);
    if (isSubscribedTo(cached)) {
      setSubscribed(true);
      return;
    }

    (async () => {
      try {
        const data = await fetchOnchainSubscriptions(wallet);
        if (!active) return;
        if (isSubscribedTo(data)) {
          setSubscribed(true);
        }
      } catch {
        // ignore
      }
    })();

    return () => { active = false; };
  }, [publicKey, streamOnchainAddress]);

  async function submitOnchain() {
    setLoading(true);
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (isOwner) {
        throw new Error("You can't subscribe to your own stream.");
      }
      if (!streamOnchainAddress || !streamAuthority || !streamDao) {
        throw new Error("On-chain stream or payout accounts not configured.");
      }
      const { transaction } = await buildSubscribeTransaction({
        connection,
        subscriber: publicKey,
        stream: streamOnchainAddress,
        tierId,
        pricingType,
        evidenceLevel,
        expiresAtMs: defaultExpiryMs(),
        quotaRemaining: parseQuota(quota) ?? 0,
        priceLamports: parseSolLamports(price),
        maker: streamAuthority,
        treasury: streamDao,
      });
      const signature = await sendTransaction(transaction, connection);
      const subscription = await registerSubscription({
        streamId,
        subscriberWallet: publicKey.toBase58(),
      });
      setSubscribed(true);
      toast(`Subscribed on-chain ${signature.slice(0, 10)}…`, "success");
      if (requiresKey && (subscription?.needsKey || subscriptionKeyReady === false)) {
        toast("Subscribed. Register your stream encryption key to decrypt private signals.", "warn");
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("subscriptionsDirty", "1");
      }
      onSubscribed?.();
    } catch (err: any) {
      toast(err.message ?? "On-chain subscribe failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="subscribe-form">
      {subscribed ? (
        <button className="button ghost" disabled>Subscribed</button>
      ) : (
        <>
          {requiresKey && subscriptionKeyReady === false && (
            <p className="subtext">Subscribe now; register a listener agent to decrypt later.</p>
          )}
          {isOwner && (
            <p className="subtext">You are the stream authority and cannot subscribe to your own stream.</p>
          )}
          <button
            className="button ghost"
            onClick={submitOnchain}
            disabled={
              loading ||
              !streamOnchainAddress ||
              !streamAuthority ||
              !streamDao ||
              isOwner
            }
          >
            {loading ? "Submitting…" : "Subscribe on-chain"}
          </button>
          {(!streamOnchainAddress || !streamAuthority || !streamDao) && (
            <p className="subtext">On-chain stream or payout accounts not configured.</p>
          )}
        </>
      )}
    </div>
  );
}
