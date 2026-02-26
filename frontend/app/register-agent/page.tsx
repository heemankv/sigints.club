"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchStreams, readStreamsCache } from "../lib/api/streams";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../lib/api/subscriptions";
import { sha256Bytes } from "../lib/solana";
import { toHex } from "../lib/utils";
import type { StreamDetail, StreamTier, OwnedSubscriptionOption } from "../lib/types";
import RegisterAgentWizard from "../components/RegisterAgentWizard";
import { toast } from "../lib/toast";

export default function RegisterAgentPage() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listenerStreamId = searchParams?.get("listenerStreamId")?.trim() ?? "";
  const fromListenerLink = Boolean(listenerStreamId);

  const [streamCatalog, setStreamCatalog] = useState<StreamDetail[]>([]);
  const [ownedSubscriptionOptions, setOwnedSubscriptionOptions] = useState<OwnedSubscriptionOption[]>([]);

  const walletAddr = publicKey?.toBase58();

  useEffect(() => {
    if (!walletAddr) return;
    void loadSubscriptions();
  }, [walletAddr]);

  async function buildTierIndex(stream: StreamDetail): Promise<Map<string, StreamTier>> {
    const entries = await Promise.all(
      stream.tiers.map(async (tier) => {
        const hash = toHex(await sha256Bytes(tier.tierId));
        return [hash, tier] as const;
      })
    );
    return new Map(entries);
  }

  async function processSubscriptions(
    subs: import("../lib/types").OnChainSubscription[],
    streamList: StreamDetail[]
  ) {
    setStreamCatalog(streamList);

    const streamByPda = new Map<string, StreamDetail>();
    streamList.forEach((stream) => {
      if (stream.onchainAddress) {
        streamByPda.set(stream.onchainAddress, stream);
      }
    });

    const tierIndexCache = new Map<string, Map<string, StreamTier>>();
    const ownedOptions: OwnedSubscriptionOption[] = [];

    for (const sub of subs) {
      if (sub.status !== 0) continue;
      const streamMeta = streamByPda.get(sub.stream);
      let tierMatch: StreamTier | undefined;
      if (streamMeta) {
        let tierIndex = tierIndexCache.get(streamMeta.id);
        if (!tierIndex) {
          tierIndex = await buildTierIndex(streamMeta);
          tierIndexCache.set(streamMeta.id, tierIndex);
        }
        tierMatch = tierIndex.get(sub.tierIdHex);
      }

      const pricingType = sub.pricingType === 1 ? "subscription_unlimited" : String(sub.pricingType);
      const evidenceLevel =
        tierMatch?.evidenceLevel ?? (sub.evidenceLevel === 1 ? "verifier" : "trust");

      if (streamMeta && tierMatch && pricingType === "subscription_unlimited") {
        ownedOptions.push({
          streamId: streamMeta.id,
          streamName: streamMeta.name,
          tierId: tierMatch.tierId,
          pricingType,
          evidenceLevel: evidenceLevel as "trust" | "verifier",
          visibility: streamMeta.visibility,
          streamOnchainAddress: streamMeta.onchainAddress,
        });
      }
    }

    setOwnedSubscriptionOptions(ownedOptions);
  }

  async function loadSubscriptions() {
    if (!walletAddr) return;

    const cachedSubs = readSubscriptionsCache(walletAddr);
    const cachedStreams = readStreamsCache();
    if (cachedSubs?.subscriptions?.length && cachedStreams?.streams?.length) {
      await processSubscriptions(cachedSubs.subscriptions, cachedStreams.streams);
    }

    try {
      const [subsRes, streamsRes] = await Promise.all([
        fetchOnchainSubscriptions(walletAddr),
        fetchStreams({ includeTiers: true }),
      ]);
      await processSubscriptions(subsRes.subscriptions ?? [], streamsRes.streams ?? []);
    } catch (err: any) {
      toast(err?.message ?? "Failed to load subscriptions.", "error");
      setOwnedSubscriptionOptions([]);
    }
  }

  return (
    <div className="maker-dash">
      <div className="maker-dash-header">
        <span className="kicker">Maker Dashboard</span>
        <h1 className="maker-dash-title">Register Agent</h1>
        <p className="maker-dash-subtitle">
          Create an agent to publish signals or listen to streams on your behalf.
        </p>
      </div>

      {!publicKey && (
        <p className="subtext">Connect your wallet to register an agent.</p>
      )}

      {publicKey && walletAddr && (
        <RegisterAgentWizard
          walletAddr={walletAddr}
          streamCatalog={streamCatalog}
          ownedSubscriptionOptions={ownedSubscriptionOptions}
          onAgentCreated={() => router.push("/profile/agents")}
          roleMode={fromListenerLink ? "listenerOnly" : "both"}
          heading={fromListenerLink ? "Register Listener Agent" : undefined}
          preset={
            fromListenerLink
              ? {
                  listenerEnabled: true,
                  listenerStreamIds: [listenerStreamId],
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
