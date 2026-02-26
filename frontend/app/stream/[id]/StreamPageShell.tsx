"use client";

import { useEffect, useState } from "react";
import StreamPageClient from "./StreamPageClient";
import { fetchStream, readStreamsCache } from "../../lib/api/streams";
import { getFallbackStream } from "../../lib/fallback";
import type { StreamDetail } from "../../lib/types";
import type { StreamDetail as FallbackStreamDetail } from "../../lib/fallback";

type AnyStream = StreamDetail | FallbackStreamDetail;

function StreamPageSkeleton() {
  return (
    <div className="stream-detail">
      <div className="stream-detail-header stream-detail-header--split">
        <div className="stream-detail-header-main">
          <div className="skeleton-line short shimmer" />
          <div className="skeleton-line wide shimmer" />
          <div className="skeleton-line shimmer" style={{ width: "60%" }} />
          <div className="skeleton-actions">
            <div className="skeleton-pill shimmer" />
            <div className="skeleton-pill shimmer" />
          </div>
        </div>
        <div className="stream-detail-header-side">
          <div className="signal-activity signal-activity--open">
            <div className="signal-activity__toggle">
              <span>Signal Activity</span>
              <span className="signal-activity__meta">Loading…</span>
            </div>
            <div className="signal-activity__list">
              <div className="signal-activity__empty">Loading stream data…</div>
            </div>
          </div>
        </div>
      </div>
      <div className="stream-detail-body">
        <div className="stream-detail-section stream-step">
          <div className="skeleton-line wide shimmer" />
          <div className="skeleton-line shimmer" />
          <div className="skeleton-line short shimmer" />
        </div>
        <div className="stream-detail-section stream-step">
          <div className="skeleton-line wide shimmer" />
          <div className="skeleton-line shimmer" />
          <div className="skeleton-line short shimmer" />
        </div>
      </div>
    </div>
  );
}

export default function StreamPageShell({ streamId }: { streamId: string }) {
  const [stream, setStream] = useState<AnyStream | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const cached = readStreamsCache();
    const cachedStream = cached?.streams?.find((item) => item.id === streamId) ?? null;
    if (cachedStream) {
      setStream(cachedStream);
      setLoading(false);
    }

    (async () => {
      try {
        const data = await fetchStream(streamId);
        if (!active) return;
        setStream(data.stream);
      } catch {
        const fallback = getFallbackStream(streamId);
        if (!active) return;
        setStream(fallback ?? null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [streamId]);

  if (loading && !stream) {
    return <StreamPageSkeleton />;
  }

  if (!stream) {
    return (
      <>
        <h1 className="section-title">Stream not found</h1>
        <p className="subtext">Try another stream from the discovery page.</p>
      </>
    );
  }

  return <StreamPageClient stream={stream} />;
}
