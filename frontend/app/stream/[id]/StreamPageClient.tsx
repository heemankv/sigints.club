"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import PublishSignal from "./PublishSignal";
import DecryptPanel from "./DecryptPanel";
import FollowMaker from "./FollowMaker";
import SubscribeForm from "./SubscribeForm";
import type { StreamDetail } from "../../lib/types";
import type { StreamDetail as FallbackStreamDetail } from "../../lib/fallback";

type AnyStream = StreamDetail | FallbackStreamDetail;

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <span className="copyable-address" onClick={copy} title={address}>
      <span className="mono">{short}</span>
      <span className="copyable-address__icon">{copied ? "Copied!" : "Copy"}</span>
    </span>
  );
}

export default function StreamPageClient({ stream }: { stream: AnyStream }) {
  const { publicKey } = useWallet();
  const isOwner =
    publicKey &&
    "authority" in stream &&
    stream.authority &&
    publicKey.toBase58() === stream.authority;
  const onchainAddress = "onchainAddress" in stream ? stream.onchainAddress : undefined;

  return (
    <div className="stream-detail">
      {/* Shared header */}
      <div className="stream-detail-header">
        {stream.domain && <span className="kicker">{stream.domain}</span>}
        <h1 className="stream-detail-title">{stream.name}</h1>
        {stream.description && <p className="subtext">{stream.description}</p>}
        {onchainAddress && (
          <p className="subtext">
            On-chain stream address: <CopyableAddress address={onchainAddress} />
          </p>
        )}
        <div className="badges">
          {stream.accuracy && <span className="badge">Accuracy {stream.accuracy}</span>}
          {stream.latency && <span className="badge">Latency {stream.latency}</span>}
          {"visibility" in stream && stream.visibility && (
            <span className={`badge ${stream.visibility === "private" ? "badge-private" : "badge-public"}`}>
              {stream.visibility}
            </span>
          )}
        </div>
      </div>

      {isOwner ? (
        /* Owner view — publish flow */
        <div className="stream-detail-section">
          <h3 className="stream-detail-section-title">Publish Signal</h3>
          <p className="subtext">Step 1 prepares off-chain. Step 2 signs and records on-chain.</p>
          <PublishSignal
            streamId={stream.id}
            tierId={stream.tiers[0]?.tierId ?? "tier"}
            tiers={stream.tiers as StreamDetail["tiers"]}
            streamVisibility={"visibility" in stream ? stream.visibility : undefined}
            streamOnchainAddress={onchainAddress}
          />
        </div>
      ) : (
        /* Visitor view — subscribe + decrypt */
        <>
          {"tapestryProfileId" in stream && stream.tapestryProfileId && (
            <FollowMaker targetProfileId={stream.tapestryProfileId} />
          )}

          {stream.tiers.length > 0 && (
            <div className="stream-detail-section">
              <h3 className="stream-detail-section-title">Subscribe</h3>
              <p className="subtext">Choose a pricing tier and subscribe.</p>
              <div className="tier-cards">
                {stream.tiers.map((tier) => (
                  <div className="tier-card" key={tier.tierId}>
                    <div className="tier-card-header">
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{tier.tierId}</h4>
                      <span className="badge">{tier.price}</span>
                    </div>
                    <p className="subtext" style={{ margin: "0 0 10px", fontSize: 13 }}>
                      {tier.pricingType === "subscription_unlimited" ? "Monthly subscription" : tier.pricingType}
                      {tier.quota ? ` · Quota: ${tier.quota}` : ""}
                      {" · Evidence: "}{tier.evidenceLevel}
                    </p>
                    <SubscribeForm
                      streamId={stream.id}
                      tierId={tier.tierId}
                      pricingType={tier.pricingType}
                      evidenceLevel={tier.evidenceLevel}
                      price={tier.price}
                      quota={tier.quota}
                      streamOnchainAddress={onchainAddress}
                      streamAuthority={"authority" in stream ? stream.authority : undefined}
                      streamDao={"dao" in stream ? stream.dao : undefined}
                      streamVisibility={"visibility" in stream ? stream.visibility : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stream-detail-section">
            <h3 className="stream-detail-section-title">Decrypt Signal</h3>
            <DecryptPanel streamId={stream.id} />
          </div>
        </>
      )}
    </div>
  );
}
