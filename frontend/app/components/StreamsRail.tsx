"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { StreamDetail, SignalEvent } from "../lib/types";
import { fetchSignalEvents, readSignalsCache } from "../lib/api/signals";
import { fetchStreams, fetchStreamSubscribers, readStreamsCache } from "../lib/api/streams";
import { timeAgo, formatFullTimestamp } from "../lib/utils";

export default function StreamsRail() {
  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [streamingEvents, setStreamingEvents] = useState<SignalEvent[]>([]);
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});
  const streamingCursor = useRef(0);
  const streamingPoll = useRef<number | null>(null);
  const subscriberCountFetchedAt = useRef<Record<string, number>>({});

  const streamById = useMemo(
    () => new Map(streams.map((s) => [s.id, s])),
    [streams]
  );

  const latestStreams = useMemo(() => {
    return [...streams]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 6);
  }, [streams]);

  // Load streams
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const cached = readStreamsCache();
        if (cached?.streams?.length && !cancelled) setStreams(cached.streams);
        const data = await fetchStreams({ includeTiers: true });
        if (!cancelled) setStreams(data.streams ?? []);
      } catch {
        if (!cancelled) setStreams([]);
      }
    }
    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Poll signal events
  useEffect(() => {
    let mounted = true;

    function sortEvents(events: SignalEvent[]) {
      return [...events].sort((a, b) => (b.createdAt - a.createdAt) || (b.id - a.id));
    }

    // Hydrate from cache instantly so panel is never empty on navigation
    const cached = readSignalsCache();
    if (cached?.events?.length) {
      const cachedEvents = sortEvents(cached.events);
      setStreamingEvents(cachedEvents);
      streamingCursor.current = Math.max(...cachedEvents.map((e) => e.id));
    }

    async function loadInitial() {
      try {
        const data = await fetchSignalEvents({ limit: 12 });
        if (!mounted) return;
        const events = sortEvents(data.events ?? []);
        setStreamingEvents(events);
        if (events.length) {
          streamingCursor.current = Math.max(...events.map((e) => e.id));
        }
      } catch {
        if (!mounted) setStreamingEvents([]);
      }
    }

    void loadInitial();

    if (streamingPoll.current) {
      window.clearInterval(streamingPoll.current);
      streamingPoll.current = null;
    }

    streamingPoll.current = window.setInterval(async () => {
      try {
        const after = streamingCursor.current || undefined;
        const data = await fetchSignalEvents({ limit: 12, after });
        if (!mounted) return;
        if (data.events?.length) {
          streamingCursor.current = Math.max(streamingCursor.current, ...data.events.map((e) => e.id));
          const incoming = sortEvents(data.events ?? []);
          setStreamingEvents((prev) => {
            const merged = [...incoming, ...prev];
            const seen = new Set<number>();
            const deduped = merged.filter((event) => {
              if (seen.has(event.id)) return false;
              seen.add(event.id);
              return true;
            });
            return sortEvents(deduped).slice(0, 12);
          });
        }
      } catch {
        // ignore polling failures
      }
    }, 10_000);

    return () => {
      mounted = false;
      if (streamingPoll.current) {
        window.clearInterval(streamingPoll.current);
        streamingPoll.current = null;
      }
    };
  }, []);

  // Fetch subscriber counts
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const streamIds = Array.from(new Set(streamingEvents.map((e) => e.streamId)));
    const toFetch = streamIds.filter((id) => {
      const last = subscriberCountFetchedAt.current[id] ?? 0;
      return now - last > 60_000;
    });
    if (!toFetch.length) return;

    void (async () => {
      const entries = await Promise.all(
        toFetch.map(async (id) => {
          try {
            const res = await fetchStreamSubscribers(id);
            return [id, res.count] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const updates = Object.fromEntries(
        entries.filter((item): item is readonly [string, number] => item !== null)
      );
      if (Object.keys(updates).length) {
        setSubscriberCounts((prev) => ({ ...prev, ...updates }));
        Object.keys(updates).forEach((id) => {
          subscriberCountFetchedAt.current[id] = Date.now();
        });
      }
    })();

    return () => { cancelled = true; };
  }, [streamingEvents]);

  return (
    <aside className="social-rail">
      {/* Latest streams */}
      <div className="x-rail-module">
        <h3 className="x-rail-heading">Latest Streams</h3>
        {latestStreams.map((stream) => {
          const createdAt = stream.createdAt ?? 0;
          const timeLabel = createdAt ? `${timeAgo(createdAt)} ago` : "new";
          return (
            <div className="x-trend-item" key={stream.id}>
              <span className="x-trend-category">{stream.domain} · {timeLabel}</span>
              <strong className="x-trend-topic">{stream.name}</strong>
              <span className="x-trend-meta">{stream.evidence} evidence</span>
            </div>
          );
        })}
        {!latestStreams.length && <span className="x-trend-category">No stream data yet.</span>}
      </div>

      {/* What's streaming */}
      <div className="x-rail-module">
        <h3 className="x-rail-heading">What&apos;s streaming</h3>
        {streamingEvents.slice(0, 5).map((event) => {
          const stream = streamById.get(event.streamId);
          const subs = subscriberCounts[event.streamId];
          const subsLabel = typeof subs === "number" ? `${subs} sub${subs === 1 ? "" : "s"}` : null;
          return (
            <Link className="x-trend-item" key={event.id} href={`/stream/${event.streamId}`}>
              <span className="x-trend-category">
                Signal · {timeAgo(event.createdAt)} ago
              </span>
              <strong className="x-trend-topic">
                {stream?.name ?? event.streamId}
              </strong>
              <span className="x-trend-meta">
                {formatFullTimestamp(event.createdAt)}
                {subsLabel ? ` · ${subsLabel}` : ""}
              </span>
            </Link>
          );
        })}
        {!streamingEvents.length && (
          <span className="x-trend-category">No signals yet.</span>
        )}
      </div>
    </aside>
  );
}
