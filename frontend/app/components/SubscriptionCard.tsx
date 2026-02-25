"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildSubscribeInstruction,
  defaultExpiryMs,
  resolveEvidenceLevel,
  resolveStreamPubkey,
  resolvePricingType,
  resolveProgramId,
} from "../lib/solana";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getCardArtUrl } from "../lib/cardArt";
import { parseSolLamports } from "../lib/pricing";
import { parseQuota } from "../lib/utils";
import { toast } from "../lib/toast";

type SubscriptionCardProps = {
  streamId: string;
  streamName: string;
  domain: string;
  accuracy: string;
  latency: string;
  evidence: string;
  tierId: string;
  pricingType: string;
  price: string;
  quota?: string;
  evidenceLevel: string;
  streamOnchainAddress?: string;
  maker?: string;
  treasury?: string;
};

function formatTierLabel(tierId: string): string {
  return tierId.replace(/^tier-/, "").replace(/-/g, " ").toUpperCase();
}

export default function SubscriptionCard({
  streamId,
  streamName,
  domain,
  accuracy,
  latency,
  evidence,
  tierId,
  pricingType,
  price,
  quota,
  evidenceLevel,
  streamOnchainAddress,
  maker,
  treasury,
}: SubscriptionCardProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);

  async function subscribeOnchain() {
    setLoading(true);
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet to buy this subscription.");
      }
      if (!maker || !treasury) {
        throw new Error("Maker or treasury address missing.");
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
        maker: new PublicKey(maker),
        treasury: new PublicKey(treasury),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      toast(`Subscription minted on-chain ${signature.slice(0, 10)}…`, "success");
    } catch (err: any) {
      toast(err.message ?? "Failed to subscribe", "error");
    } finally {
      setLoading(false);
    }
  }

  const artUrl = getCardArtUrl(`${streamId}:${tierId}`);
  const tierLabel = formatTierLabel(tierId);
  const disabled = !streamOnchainAddress || !maker || !treasury;
  const pricingLabel = pricingType === "subscription_unlimited"
    ? "monthly subscription"
    : pricingType.replace(/_/g, " ");

  return (
    <div className="data-card">
      <div className="data-card__media">
        <img src={artUrl} alt={`${streamName} art`} />
        <div className="data-card__overlay">
          <span className="badge">{evidenceLevel}</span>
          <span className="badge accent">{pricingLabel}</span>
        </div>
        <div className="data-card__tier">{tierLabel}</div>
      </div>
      <div className="data-card__body">
        <div className="data-card__title">
          <div>
            <h3>{streamName}</h3>
            <p className="subtext">{domain} • {accuracy} • {latency}</p>
          </div>
          <div className="data-card__price">{price}</div>
        </div>
        <p className="subtext">{evidence}</p>
        {quota && <p className="subtext">Quota: {quota}</p>}
        <div className="data-card__actions">
          <button
            className="button primary"
            onClick={subscribeOnchain}
            disabled={loading || disabled}
          >
            {loading ? "Minting…" : "Buy on-chain"}
          </button>
          <a className="button ghost" href={`/stream/${streamId}`}>View Stream</a>
        </div>
        {disabled && (
          <p className="subtext">On-chain stream or payout accounts not configured.</p>
        )}
      </div>
    </div>
  );
}
