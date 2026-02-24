"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  buildSubscribeInstruction,
  defaultExpiryMs,
  resolveEvidenceLevel,
  resolveStreamPubkey,
  resolvePricingType,
  resolveProgramId,
  hasRegisteredSubscriptionKey,
} from "../../lib/solana";
import { parseSolLamports } from "../../lib/pricing";
import { explorerTx } from "../../lib/constants";
import { parseQuota } from "../../lib/utils";
import { registerSubscription } from "../../lib/sdkBackend";

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
}) {
  const [loading, setLoading] = useState(false);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [chainTx, setChainTx] = useState<string | null>(null);
  const [subscriptionKeyReady, setSubscriptionKeyReady] = useState<boolean | null>(null);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const visibility = streamVisibility ?? "private";
  const requiresKey = visibility === "private";
  const keyReady = !requiresKey || subscriptionKeyReady === true;
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

  async function submitOnchain() {
    setLoading(true);
    setChainStatus(null);
    setChainTx(null);
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (isOwner) {
        throw new Error("You can't subscribe to your own stream.");
      }
      if (requiresKey && subscriptionKeyReady === false) {
        throw new Error("Register your stream encryption key before subscribing to private streams.");
      }
      if (!streamOnchainAddress || !streamAuthority || !streamDao) {
        throw new Error("On-chain stream or payout accounts not configured.");
      }
      const programId = resolveProgramId();
      const streamPubkey = resolveStreamPubkey(streamOnchainAddress);
      const ix = await buildSubscribeInstruction({
        programId,
        stream: streamPubkey,
        subscriber: publicKey,
        tierId,
        pricingType: resolvePricingType(pricingType),
        evidenceLevel: resolveEvidenceLevel(evidenceLevel),
        expiresAtMs: defaultExpiryMs(),
        quotaRemaining: parseQuota(quota) ?? 0,
        priceLamports: parseSolLamports(price),
        maker: new PublicKey(streamAuthority),
        treasury: new PublicKey(streamDao),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      setChainTx(signature);
      await registerSubscription({
        streamId,
        subscriberWallet: publicKey.toBase58(),
      });
      setChainStatus("Subscribed and registered.");
      if (typeof window !== "undefined") {
        window.localStorage.setItem("subscriptionsDirty", "1");
      }
    } catch (err: any) {
      setChainStatus(err.message ?? "On-chain subscribe failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="hud-corners" />
      <h3>Subscribe to {tierId}</h3>
      <p className="subtext">
        {requiresKey
          ? "Private stream: register your stream encryption key first."
          : "Public stream: no encryption key required."}
      </p>
      {requiresKey && subscriptionKeyReady === null && (
        <p className="subtext">Checking encryption key status…</p>
      )}
      {requiresKey && subscriptionKeyReady === false && (
        <p className="subtext">Stream key missing. Register it above before subscribing.</p>
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
          !keyReady ||
          isOwner
        }
      >
        {loading ? "Submitting…" : "Subscribe on-chain"}
      </button>
      {(!streamOnchainAddress || !streamAuthority || !streamDao) && (
        <p className="subtext">On-chain stream or payout accounts not configured.</p>
      )}
      {chainStatus && <p className="subtext">{chainStatus}</p>}
      {chainTx && (
        <p className="subtext">
          Explorer{" "}
          <a className="link" href={explorerTx(chainTx)} target="_blank">
            {chainTx.slice(0, 10)}…
          </a>
        </p>
      )}
    </div>
  );
}
