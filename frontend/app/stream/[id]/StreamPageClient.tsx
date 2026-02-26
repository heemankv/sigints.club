"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import PublishSignal from "./PublishSignal";
import DecryptPanel from "./DecryptPanel";
import FollowMaker from "./FollowMaker";
import SubscribeForm from "./SubscribeForm";
import Link from "next/link";
import type { StreamDetail, OnChainSubscription, AgentProfile, AgentSubscription, OwnedSubscriptionOption, StreamTier } from "../../lib/types";
import type { StreamDetail as FallbackStreamDetail } from "../../lib/fallback";
import type { SignalEvent } from "../../lib/types";
import { fetchSignalEvents } from "../../lib/api/signals";
import { fetchOnchainSubscriptions, readSubscriptionsCache } from "../../lib/api/subscriptions";
import {
  fetchAgents,
  readAgentsCache,
  fetchAgentSubscriptions,
  readAgentSubsCache,
} from "../../lib/api/agents";
import { formatFullTimestamp, timeAgo, toHex } from "../../lib/utils";
import { hasRegisteredSubscriptionKey, resolveProgramId, resolveStreamPubkey, sha256Bytes } from "../../lib/solana";
import CopyBlinkButton from "../../components/CopyBlinkButton";
import TradeSignalCard from "./TradeSignalCard";

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
  const { connection } = useConnection();
  const walletAddr = publicKey?.toBase58() ?? null;
  const [signalEvents, setSignalEvents] = useState<SignalEvent[]>([]);
  const [activeSubscription, setActiveSubscription] = useState<OnChainSubscription | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionKeyReady, setSubscriptionKeyReady] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentSubscriptions, setAgentSubscriptions] = useState<AgentSubscription[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [tierIndex, setTierIndex] = useState<Map<string, StreamTier>>(new Map());
  const lastEventIdRef = useRef<number>(0);
  const pollRef = useRef<number | null>(null);
  const isOwner =
    publicKey &&
    "authority" in stream &&
    stream.authority &&
    publicKey.toBase58() === stream.authority;
  const onchainAddress = "onchainAddress" in stream ? stream.onchainAddress : undefined;
  const isPublicStream = "visibility" in stream && stream.visibility === "public";

  const findActiveSub = useCallback(
    (data: { subscriptions: OnChainSubscription[] } | null) => {
      if (!data?.subscriptions?.length || !onchainAddress) return null;
      const now = Date.now();
      return (
        data.subscriptions.find(
          (sub) =>
            sub.status === 0 &&
            sub.stream === onchainAddress &&
            (!sub.expiresAt || sub.expiresAt > now)
        ) ?? null
      );
    },
    [onchainAddress]
  );

  const isSubscribed = Boolean(activeSubscription);
  const daysLeft = useMemo(() => {
    if (!activeSubscription?.expiresAt) return null;
    const diff = activeSubscription.expiresAt - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [activeSubscription?.expiresAt]);
  const showSubscriptionStatus = !isOwner && isSubscribed && daysLeft !== null;

  const ownedSubscriptionOptions = useMemo<OwnedSubscriptionOption[]>(() => {
    if (!activeSubscription || !("tiers" in stream)) return [];
    if (activeSubscription.status !== 0) return [];
    const tierMatch = tierIndex.get(activeSubscription.tierIdHex);
    const pricingType = activeSubscription.pricingType === 1
      ? "subscription_unlimited"
      : String(activeSubscription.pricingType);
    if (pricingType !== "subscription_unlimited") return [];
    const evidenceLevel =
      tierMatch?.evidenceLevel ?? (activeSubscription.evidenceLevel === 1 ? "verifier" : "trust");
    const tierId = tierMatch?.tierId ?? `tier-${activeSubscription.tierIdHex.slice(0, 6)}`;
    return [
      {
        streamId: stream.id,
        streamName: stream.name,
        tierId,
        pricingType,
        evidenceLevel: evidenceLevel as "trust" | "verifier",
        visibility: "visibility" in stream ? stream.visibility : undefined,
        streamOnchainAddress: onchainAddress,
      },
    ];
  }, [activeSubscription, stream, tierIndex, onchainAddress]);

  const agentsById = useMemo(() => {
    return new Map(agents.map((agent) => [agent.id, agent]));
  }, [agents]);

  const linkedAgents = useMemo(() => {
    return agentSubscriptions.map((sub) => ({
      subscription: sub,
      agent: agentsById.get(sub.agentId),
    }));
  }, [agentSubscriptions, agentsById]);

  const senderAgents = useMemo(() => {
    return agents.filter(
      (agent) =>
        (agent.role === "maker" || agent.role === "both") &&
        agent.streamId === stream.id
    );
  }, [agents, stream.id]);

  useEffect(() => {
    let mounted = true;
    const streamId = stream.id;

    function sortEvents(events: SignalEvent[]) {
      return [...events].sort((a, b) => (b.createdAt - a.createdAt) || (b.id - a.id));
    }

    async function loadInitial() {
      try {
        const data = await fetchSignalEvents({ streamId, limit: 8 });
        if (!mounted) return;
        const events = sortEvents(data.events ?? []);
        setSignalEvents(events.slice(0, 4));
        if (events.length) {
          lastEventIdRef.current = Math.max(...events.map((e) => e.id));
        }
      } catch {
        if (!mounted) return;
        setSignalEvents([]);
      }
    }

    void loadInitial();

    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const after = lastEventIdRef.current;
        const data = await fetchSignalEvents({ streamId, limit: 8, after });
        if (!mounted) return;
        if (data.events?.length) {
          const newestId = Math.max(after, ...data.events.map((e) => e.id));
          lastEventIdRef.current = newestId;
          const incoming = sortEvents(data.events ?? []);
          setSignalEvents((prev) => {
            const merged = [...incoming, ...prev];
            const seen = new Set<number>();
            const deduped = merged.filter((event) => {
              if (seen.has(event.id)) return false;
              seen.add(event.id);
              return true;
            });
            return sortEvents(deduped).slice(0, 4);
          });
        }
      } catch {
        // ignore polling failures
      }
    }, 10_000);

    return () => {
      mounted = false;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [stream.id]);

  useEffect(() => {
    let active = true;
    async function buildTierIndex() {
      if (!("tiers" in stream)) {
        if (active) setTierIndex(new Map());
        return;
      }
      const entries = await Promise.all(
        stream.tiers.map(async (tier) => {
          const hash = toHex(await sha256Bytes(tier.tierId));
          return [hash, tier] as const;
        })
      );
      if (active) setTierIndex(new Map(entries));
    }
    void buildTierIndex();
    return () => {
      active = false;
    };
  }, [stream]);

  useEffect(() => {
    let active = true;
    if (!walletAddr || !onchainAddress) {
      setActiveSubscription(null);
      setSubscriptionLoading(false);
      return;
    }

    const cached = readSubscriptionsCache(walletAddr);
    if (cached) {
      setActiveSubscription(findActiveSub(cached));
    } else {
      setSubscriptionLoading(true);
    }

    (async () => {
      try {
        const data = await fetchOnchainSubscriptions(walletAddr);
        if (!active) return;
        setActiveSubscription(findActiveSub(data));
      } catch {
        if (!active) return;
        setActiveSubscription(null);
      } finally {
        if (active) setSubscriptionLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [walletAddr, onchainAddress]);

  useEffect(() => {
    let active = true;
    async function checkSubscriptionKey() {
      if (!publicKey) {
        setSubscriptionKeyReady(null);
        return;
      }
      if (isPublicStream) {
        setSubscriptionKeyReady(true);
        return;
      }
      if (!onchainAddress || !activeSubscription) {
        setSubscriptionKeyReady(null);
        return;
      }
      try {
        const programId = resolveProgramId();
        const streamPubkey = resolveStreamPubkey(onchainAddress);
        const registered = await hasRegisteredSubscriptionKey(connection, programId, streamPubkey, publicKey);
        if (!active) return;
        setSubscriptionKeyReady(registered);
      } catch {
        if (!active) return;
        setSubscriptionKeyReady(false);
      }
    }

    void checkSubscriptionKey();
    return () => {
      active = false;
    };
  }, [publicKey, connection, isPublicStream, onchainAddress, activeSubscription]);

  useEffect(() => {
    let active = true;
    if (!walletAddr) {
      setAgents([]);
      setAgentsLoading(false);
      return;
    }
    const cached = readAgentsCache(walletAddr);
    if (cached?.length) setAgents(cached);
    if (cached === null) setAgentsLoading(true);

    (async () => {
      try {
        const res = await fetchAgents({ owner: walletAddr });
        if (!active) return;
        setAgents(res.agents ?? []);
      } catch {
        // preserve existing UI on transient errors
      } finally {
        if (active) setAgentsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [walletAddr]);

  useEffect(() => {
    let active = true;
    if (!walletAddr) {
      setAgentSubscriptions([]);
      return;
    }
    const cached = readAgentSubsCache(walletAddr);
    if (cached?.length) {
      setAgentSubscriptions(cached.filter((sub) => sub.streamId === stream.id));
    }

    (async () => {
      try {
        const res = await fetchAgentSubscriptions({ owner: walletAddr, streamId: stream.id });
        if (!active) return;
        setAgentSubscriptions(res.agentSubscriptions ?? []);
      } catch {
        // preserve existing UI on transient errors
      }
    })();

    return () => {
      active = false;
    };
  }, [walletAddr, stream.id]);

  const refreshSubscription = useCallback(async () => {
    if (!walletAddr || !onchainAddress) return;
    try {
      const data = await fetchOnchainSubscriptions(walletAddr, { fresh: true });
      setActiveSubscription(findActiveSub(data));
    } catch {
      setActiveSubscription(null);
    }
  }, [walletAddr, onchainAddress, findActiveSub]);

  const refreshAgents = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetchAgents({ owner: walletAddr });
      setAgents(res.agents ?? []);
    } catch {
      setAgents([]);
    }
  }, [walletAddr]);

  const refreshAgentSubscriptions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const res = await fetchAgentSubscriptions({ owner: walletAddr, streamId: stream.id });
      setAgentSubscriptions(res.agentSubscriptions ?? []);
    } catch {
      setAgentSubscriptions([]);
    }
  }, [walletAddr, stream.id]);

  return (
    <div className="stream-detail">
      {/* Header */}
      <div className="stream-detail-header stream-detail-header--split">
        <div className="stream-detail-header-main">
          {stream.domain && <span className="kicker">{stream.domain}</span>}
          <div className="stream-detail-title-row">
            <h1 className="stream-detail-title" style={{ margin: 0 }}>{stream.name}</h1>
            {"visibility" in stream && stream.visibility && (
              <span className={`badge ${stream.visibility === "private" ? "badge-private" : "badge-public"}`}>
                {stream.visibility}
              </span>
            )}
          </div>
          <div className="stream-detail-actions">
            <CopyBlinkButton streamId={stream.id} label="Copy Blink" className="stream-card-copy-blink" />
            {"tapestryProfileId" in stream && stream.tapestryProfileId && !isOwner && (
              <FollowMaker targetProfileId={stream.tapestryProfileId} />
            )}
          </div>
          {stream.description ? (
            <p className="subtext">
              {stream.description}
              {showSubscriptionStatus && (
                <>{" | "}{daysLeft === 0 ? "Expires today." : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your subscription.`}</>
              )}
            </p>
          ) : (
            showSubscriptionStatus && (
              <p className="subtext">
                {daysLeft === 0 ? "Expires today." : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your subscription.`}
              </p>
            )
          )}
          <div className="stream-detail-meta">
            {onchainAddress && (
              <span className="subtext">
                <CopyableAddress address={onchainAddress} />
              </span>
            )}
            {stream.accuracy && <span className="badge">Accuracy {stream.accuracy}</span>}
            {stream.latency && <span className="badge">Latency {stream.latency}</span>}
          </div>
        </div>
        <div className="stream-detail-header-side">
          <div className="signal-activity signal-activity--open">
            <div className="signal-activity__toggle">
              <span>Signal Activity</span>
              <span className="signal-activity__meta">
                {signalEvents[0] ? `Last signal ${timeAgo(signalEvents[0].createdAt)} ago` : "No signals yet"}
              </span>
            </div>
            <div className="signal-activity__list">
              {signalEvents.length === 0 && (
                <div className="signal-activity__empty">No signals recorded yet.</div>
              )}
              {signalEvents.map((event) => (
                <div key={event.id} className="signal-activity__item">
                  <span className="signal-activity__time">{formatFullTimestamp(event.createdAt)}</span>
                  <span className="signal-activity__meta">{event.visibility}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="stream-detail-body">
        {isOwner ? (
          <>
            {senderAgents.length === 0 ? (
              <div className="stream-detail-section stream-step">
                <div className="stream-step-header">
                  <h3 className="stream-detail-section-title">Register Publisher Agent</h3>
                  <span className="subtext">Create a publisher agent so you can publish signals from this stream.</span>
                </div>
                <RegisterAgentWizard
                  key={`sender-${stream.id}`}
                  walletAddr={walletAddr ?? ""}
                  streamCatalog={"tiers" in stream ? [stream as StreamDetail] : []}
                  ownedSubscriptionOptions={[]}
                  onAgentCreated={() => { void refreshAgents(); }}
                  heading="Register Publisher Agent"
                  basicsMode="nameOnly"
                  roleMode="senderOnly"
                  lockStreamId
                  preset={{
                    senderEnabled: true,
                    streamId: stream.id,
                    domain: stream.domain ?? "stream",
                    evidence: "trust",
                  }}
                />
              </div>
            ) : (
              <div className="stream-detail-section stream-step">
                <h3 className="stream-detail-section-title">Publisher Agents</h3>
                <div className="agent-list">
                  {senderAgents.map((agent) => (
                    <div key={agent.id} className="agent-list-item">
                      <div>
                        <strong>{agent.name}</strong>
                        <span className="subtext">
                          {agent.domain} · {agent.role === "both" ? "publisher + listener" : "publisher"}
                        </span>
                      </div>
                      {agent.agentPubkey && (
                        <span className="mono">{agent.agentPubkey.slice(0, 6)}…</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          </>
        ) : (
          <>
            {!isSubscribed ? (
              <>
                <div className="stream-detail-section stream-step">
                  <div className="stream-step-header">
                    <h3 className="stream-detail-section-title">Step 1: Subscribe</h3>
                    <span className="subtext">Complete on-chain subscription to unlock listener setup.</span>
                  </div>
                  {stream.tiers.length > 0 ? (
                    <div className="tier-cards">
                      {stream.tiers.map((tier) => (
                        <div className="tier-card" key={tier.tierId}>
                          <div className="tier-card-header">
                            <h4 className="tier-card-name">{tier.tierId}</h4>
                            <span className="badge">{tier.price}</span>
                          </div>
                          <p className="subtext tier-card-meta">
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
                            onSubscribed={() => { void refreshSubscription(); }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subtext">No tiers available yet.</p>
                  )}
                  {subscriptionLoading && (
                    <p className="subtext">Checking subscription status…</p>
                  )}
                </div>
              </>
            ) : (
              <>
                {isPublicStream && (
                  <div className="stream-detail-section stream-step stream-step--compact">
                    <TradeSignalCard streamId={stream.id} />
                  </div>
                )}

                {!isPublicStream && (
                  <div className="stream-detail-section stream-step stream-step--compact">
                    <div className="stream-step-header stream-step-header--inline stream-step-header--key">
                      <div className="stream-step-key-text">
                        <span className="stream-detail-section-title">Encryption Key</span>
                        <span className="subtext">
                          {subscriptionKeyReady === true
                            ? "1 key active."
                            : subscriptionKeyReady === false
                              ? "Register your key using Actions page."
                              : "Checking key status…"}
                        </span>
                      </div>
                      <Link className="button secondary" href="/profile/actions?actionTab=streamKeys">
                        Manage Keys →
                      </Link>
                    </div>
                  </div>
                )}

                <div className="stream-detail-section stream-step stream-step--narrow">
                  <div className="stream-step-header stream-step-header--key stream-step-header--actions">
                    <div className="stream-step-key-text">
                      <h3 className="stream-detail-section-title">Listener Agents</h3>
                      {!isPublicStream && subscriptionKeyReady !== true && (
                        <span className="subtext">
                          {subscriptionKeyReady === false
                            ? "Private streams require an encryption key before linking listener agents."
                            : "Checking key status…"}
                        </span>
                      )}
                      {agentsLoading && linkedAgents.length === 0 && (
                        <span className="subtext">Loading agents…</span>
                      )}
                      {linkedAgents.length === 0 && !agentsLoading && (
                        <span className="subtext">No agents linked to this stream yet.</span>
                      )}
                    </div>
                    {isPublicStream || subscriptionKeyReady === true ? (
                      <Link
                        className="button secondary"
                        href={`/register-agent?listenerStreamId=${encodeURIComponent(stream.id)}`}
                      >
                        Register Agent →
                      </Link>
                    ) : (
                      <button className="button secondary" disabled aria-disabled="true">
                        Register Agent →
                      </button>
                    )}
                  </div>
                  {linkedAgents.length > 0 && (
                    <div className="agent-list">
                      {linkedAgents.map(({ subscription, agent }) => (
                        <div key={subscription.id} className="agent-list-item">
                          <div>
                            <strong>{agent?.name ?? "Agent"}</strong>
                            <span className="subtext">
                              {agent?.domain ?? "listener"} · {agent?.role ?? "listener"}
                            </span>
                          </div>
                          {agent?.agentPubkey && (
                            <span className="mono">{agent.agentPubkey.slice(0, 6)}…</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!isPublicStream && (
                  <div className="stream-detail-section">
                    <DecryptPanel streamId={stream.id} visibility={"visibility" in stream ? stream.visibility : undefined} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
