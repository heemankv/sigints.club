"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { AgentProfile, AgentSubscription, OwnedSubscriptionOption, StreamDetail, StreamTier } from "../../lib/types";
import { fetchAgentSubscriptions, readAgentSubsCache } from "../../lib/api/agents";
import { fetchStreams, readStreamsCache } from "../../lib/api/streams";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../../lib/api/subscriptions";
import { createAgentSubscription as sdkCreateAgentSubscription, deleteAgentSubscription } from "../../lib/sdkBackend";
import {
  sha256Bytes,
  buildGrantPublisherInstruction,
  buildRevokePublisherInstruction,
  deriveStreamPda,
  resolveStreamRegistryId,
} from "../../lib/solana";
import { toHex } from "../../lib/utils";

export default function AgentPageClient({ agent }: { agent: AgentProfile }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [agentSubscriptions, setAgentSubscriptions] = useState<AgentSubscription[]>([]);
  const [ownedSubscriptionOptions, setOwnedSubscriptionOptions] = useState<OwnedSubscriptionOption[]>([]);
  const [streamCatalog, setStreamCatalog] = useState<StreamDetail[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [linkSelection, setLinkSelection] = useState("");
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishActive, setPublishActive] = useState<boolean | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [agentSubsLoading, setAgentSubsLoading] = useState(false);

  const roleLabel =
    agent.role === "maker" ? "sender" : agent.role === "both" ? "sender + listener" : "listener";

  const streamNameById = useMemo(
    () => new Map(streamCatalog.map((stream) => [stream.id, stream.name])),
    [streamCatalog]
  );

  const linkedStreamIds = useMemo(
    () => new Set(agentSubscriptions.map((sub) => sub.streamId)),
    [agentSubscriptions]
  );

  const availableOptions = useMemo(
    () => ownedSubscriptionOptions.filter((option) => !linkedStreamIds.has(option.streamId)),
    [ownedSubscriptionOptions, linkedStreamIds]
  );

  useEffect(() => {
    void loadAgentSubscriptions();
  }, [agent.id]);

  useEffect(() => {
    void loadOwnedSubscriptions();
  }, [agent.ownerWallet]);

  useEffect(() => {
    void loadPublisherStatus();
  }, [agent.streamId, agent.agentPubkey]);

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
    subs: import("../../lib/types").OnChainSubscription[],
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
        });
      }
    }

    setOwnedSubscriptionOptions(ownedOptions);
  }

  async function loadOwnedSubscriptions(forceFresh = false) {
    if (!agent.ownerWallet) return;
    setSubsError(null);

    const cachedSubs = readSubscriptionsCache(agent.ownerWallet);
    const cachedStreams = readStreamsCache();
    const hasCacheHit = cachedSubs !== null && cachedStreams !== null;
    if (cachedSubs?.subscriptions?.length && cachedStreams?.streams?.length) {
      await processSubscriptions(cachedSubs.subscriptions, cachedStreams.streams);
    }

    if (!hasCacheHit) setSubsLoading(true);
    try {
      const [subsRes, streamsRes] = await Promise.all([
        fetchOnchainSubscriptions(agent.ownerWallet, { fresh: forceFresh }),
        fetchStreams({ includeTiers: true }),
      ]);
      await processSubscriptions(subsRes.subscriptions ?? [], streamsRes.streams ?? []);
    } catch (err: any) {
      setSubsError(err?.message ?? "Failed to load subscriptions.");
      setOwnedSubscriptionOptions([]);
    } finally {
      setSubsLoading(false);
    }
  }

  async function loadAgentSubscriptions() {
    setAgentSubsLoading(true);
    const cached = readAgentSubsCache(agent.ownerWallet);
    if (cached?.length) {
      setAgentSubscriptions(cached.filter((sub) => sub.agentId === agent.id));
    }
    try {
      const res = await fetchAgentSubscriptions({ owner: agent.ownerWallet, agentId: agent.id });
      setAgentSubscriptions(res.agentSubscriptions ?? []);
    } catch {
      // preserve existing UI on transient errors
    } finally {
      setAgentSubsLoading(false);
    }
  }

  async function linkSubscription() {
    if (linkLoading) return;
    if (!publicKey) {
      setLinkStatus("Connect your wallet first.");
      return;
    }
    if (publicKey.toBase58() !== agent.ownerWallet) {
      setLinkStatus("Connect the agent owner wallet to link subscriptions.");
      return;
    }
    if (!linkSelection) {
      setLinkStatus("Select a subscription to link.");
      return;
    }
    const option = ownedSubscriptionOptions.find((opt) => opt.streamId === linkSelection);
    if (!option) {
      setLinkStatus("Subscription details not found.");
      return;
    }
    setLinkStatus(null);
    setLinkLoading(true);
    try {
      await sdkCreateAgentSubscription({
        ownerWallet: agent.ownerWallet,
        agentId: agent.id,
        streamId: option.streamId,
        tierId: option.tierId,
        pricingType: option.pricingType,
        evidenceLevel: option.evidenceLevel,
        visibility: option.visibility,
      });
      await loadAgentSubscriptions();
      setLinkSelection("");
      setLinkStatus("Subscription linked.");
    } catch (err: any) {
      const rawMessage = err?.message ?? "Failed to link subscription.";
      if (rawMessage.toLowerCase().includes("subscription encryption key not registered")) {
        setLinkStatus(
          "Create a subscription encryption key on that stream first, then you can link it to this agent."
        );
      } else {
        setLinkStatus(rawMessage);
      }
    } finally {
      setLinkLoading(false);
    }
  }

  async function unlinkSubscription(subscriptionId: string) {
    try {
      await deleteAgentSubscription(subscriptionId);
      await loadAgentSubscriptions();
      setLinkStatus("Subscription removed.");
    } catch (err: any) {
      setLinkStatus(err?.message ?? "Failed to remove subscription.");
    }
  }

  async function grantPublisher() {
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (publicKey.toBase58() !== agent.ownerWallet) {
        throw new Error("Connect the agent owner wallet to grant publish.");
      }
      if (!agent.streamId) {
        throw new Error("Agent is missing a publish stream.");
      }
      if (!agent.agentPubkey) {
        throw new Error("Agent public key is missing.");
      }
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, agent.streamId);
      const ix = await buildGrantPublisherInstruction({
        programId,
        stream: streamPda,
        authority: publicKey,
        agent: new PublicKey(agent.agentPubkey),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
      setPublishActive(true);
    } catch (err: any) {
      setPublishError(err?.message ?? "Failed to grant publish.");
    }
  }

  async function revokePublisher() {
    try {
      if (!publicKey) {
        throw new Error("Connect your wallet first.");
      }
      if (publicKey.toBase58() !== agent.ownerWallet) {
        throw new Error("Connect the agent owner wallet to revoke publish.");
      }
      if (!agent.streamId) {
        throw new Error("Agent is missing a publish stream.");
      }
      if (!agent.agentPubkey) {
        throw new Error("Agent public key is missing.");
      }
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, agent.streamId);
      const ix = await buildRevokePublisherInstruction({
        programId,
        stream: streamPda,
        authority: publicKey,
        agent: new PublicKey(agent.agentPubkey),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
      setPublishActive(false);
    } catch (err: any) {
      setPublishError(err?.message ?? "Failed to revoke publish.");
    }
  }

  async function loadPublisherStatus() {
    if (!agent.streamId || !agent.agentPubkey) {
      setPublishActive(null);
      return;
    }
    try {
      const programId = resolveStreamRegistryId();
      const streamPda = await deriveStreamPda(programId, agent.streamId);
      const publisherDelegate = PublicKey.findProgramAddressSync(
        [Buffer.from("publisher"), streamPda.toBuffer(), new PublicKey(agent.agentPubkey).toBuffer()],
        programId
      )[0];
      const accountInfo = await connection.getAccountInfo(publisherDelegate);
      if (!accountInfo) {
        setPublishActive(false);
        return;
      }
      const status = accountInfo.data[8 + 32 + 32 + 32];
      setPublishActive(status === 1);
    } catch {
      setPublishActive(null);
    }
  }

  async function togglePublishAccess(next: boolean) {
    if (publishLoading) return;
    setPublishLoading(true);
    setPublishError(null);
    try {
      if (next) {
        await grantPublisher();
      } else {
        await revokePublisher();
      }
      await loadPublisherStatus();
    } finally {
      setPublishLoading(false);
    }
  }

  const isOwnerWallet = publicKey?.toBase58() === agent.ownerWallet;
  const canTogglePublish = publishActive !== null && isOwnerWallet;
  const publishLabel = publishActive === null
    ? "Publish status unavailable"
    : publishLoading
      ? "Updating…"
      : publishActive
        ? "Publish Enabled"
        : "Publish Disabled";

  return (
    <div className="stream-detail">
      <div className="agent-detail-header">
        <div className="agent-detail-title-row">
          <div className="agent-detail-title-body">
            <span className="kicker">Agent</span>
            <div className="stream-detail-title-row">
              <h1 className="stream-detail-title" style={{ margin: 0 }}>{agent.name}</h1>
            </div>
            <div className="chip-row" style={{ marginTop: 6 }}>
              <span className="badge badge-sm badge-gold">{roleLabel}</span>
              {agent.domain && <span className="badge badge-sm badge-teal">{agent.domain}</span>}
            </div>
            {agent.description && <p className="subtext">{agent.description}</p>}
            <div className="stream-detail-meta agent-detail-meta">
              <span className="subtext">Owner: {agent.ownerWallet}</span>
              {agent.agentPubkey && <span className="mono">Key {agent.agentPubkey}</span>}
            </div>
          </div>
        </div>
      </div>

      {agent.streamId && (agent.role === "maker" || agent.role === "both") && (
        <div className="stream-detail-section stream-step stream-step--plain agent-section">
          <div className="agent-split">
            <div className="agent-split-column">
              <div className="stream-step-header">
                <h3 className="stream-detail-section-title">Linked Stream</h3>
                <span className="subtext">The stream this agent can publish to.</span>
              </div>
              <div className="agent-list">
                <div className="agent-list-item">
                  <div>
                    <strong>{streamNameById.get(agent.streamId) ?? agent.streamId}</strong>
                    <span className="subtext">{agent.streamId}</span>
                  </div>
                  <span className="badge badge-sm badge-gold">Publisher</span>
                </div>
              </div>
            </div>
            <div className="agent-split-column">
              <div className="stream-step-header">
                <h3 className="stream-detail-section-title">Publish Access</h3>
                <span className="subtext">
                  Grant/revoke on-chain publish rights for this agent’s registered key.
                </span>
              </div>
              <div className="publish-toggle-row">
                <button
                  className={`publish-toggle${publishActive ? " publish-toggle--on" : ""}${publishLoading ? " publish-toggle--loading" : ""}`}
                  type="button"
                  onClick={() => {
                    if (publishActive === null || publishLoading || !canTogglePublish) return;
                    void togglePublishAccess(!publishActive);
                  }}
                  disabled={!canTogglePublish || publishLoading}
                  role="switch"
                  aria-checked={Boolean(publishActive)}
                  title={
                    !isOwnerWallet
                      ? "Connect the agent owner wallet to toggle publish access."
                      : publishActive === null
                        ? "Publish status unavailable."
                        : publishActive
                          ? "Revoke publish access"
                          : "Grant publish access"
                  }
                >
                  <span className="publish-toggle__label">{publishLabel}</span>
                  <span className="publish-toggle__track">
                    <span className="publish-toggle__thumb" />
                  </span>
                </button>
                {publishError && <span className="subtext">{publishError}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="stream-detail-section stream-step stream-step--plain agent-section">
        <div className="agent-split">
          <div className="agent-split-column">
            <div className="stream-step-header">
              <h3 className="stream-detail-section-title">Linked Subscriptions</h3>
              <span className="subtext">Streams this agent can listen to.</span>
            </div>
            {agentSubsLoading ? (
              <p className="subtext">Loading linked subscriptions…</p>
            ) : agentSubscriptions.length > 0 ? (
              <div className="agent-list">
                {agentSubscriptions.map((sub) => (
                  <div key={sub.id} className="agent-list-item">
                    <div>
                      <strong>{streamNameById.get(sub.streamId) ?? sub.streamId}</strong>
                      <span className="subtext">{sub.tierId}</span>
                    </div>
                    <button className="button ghost" onClick={() => void unlinkSubscription(sub.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtext">No subscriptions linked yet.</p>
            )}
          </div>
          <div className="agent-split-column">
            <div className="stream-step-header">
              <h3 className="stream-detail-section-title">Link a Subscription</h3>
              <span className="subtext">Attach a subscription NFT so the agent can listen.</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                className="input"
                value={linkSelection}
                onChange={(e) => setLinkSelection(e.target.value)}
              >
                <option value="">Select a subscription</option>
                {availableOptions.map((option) => (
                  <option key={`${agent.id}-${option.streamId}`} value={option.streamId}>
                    {option.streamName} · {option.tierId}{option.visibility ? ` · ${option.visibility}` : ""}
                  </option>
                ))}
              </select>
              <button
                className="button secondary"
                onClick={() => void linkSubscription()}
                disabled={availableOptions.length === 0 || linkLoading}
              >
                {linkLoading ? "Linking…" : "Link"}
              </button>
              <button
                className="button ghost"
                onClick={() => void loadOwnedSubscriptions(true)}
                disabled={subsLoading || linkLoading}
              >
                Refresh
              </button>
            </div>
            {availableOptions.length === 0 && !subsLoading && (
              <div className="subtext" style={{ marginTop: 8 }}>
                No unlinked subscriptions available.
              </div>
            )}
            {subsError && <p className="subtext">{subsError}</p>}
            {linkStatus && <p className="subtext">{linkStatus}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
